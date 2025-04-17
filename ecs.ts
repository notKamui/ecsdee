const COMPONENT_TOKEN = Symbol('component')

type Prettify<T> = { [K in keyof T]: T[K] } & unknown

type PascalCaseToCamelCase<S> = S extends `${infer T}${infer U}` ? `${Lowercase<T>}${U}` : S

function pascalCaseToCamelCase<S extends string>(str: S): PascalCaseToCamelCase<S> {
  const firstChar = str.charAt(0).toLowerCase()
  const rest = str.slice(1)
  return `${firstChar}${rest}` as PascalCaseToCamelCase<S>
}

type EntityId = bigint & {}

export interface ComponentDefinition<T, N extends string = string> {
  readonly type: N
  create: (data: T) => T & { readonly [COMPONENT_TOKEN]: N }
}

type ComponentInstance<C extends ComponentDefinition<any, any>> = ReturnType<C['create']>

type ComputeQuery<T extends readonly ComponentDefinition<any, any>[]> = UnionToIntersection<
  {
    [I in keyof T]: T[I] extends ComponentDefinition<infer U, infer N> ? { [P in PascalCaseToCamelCase<N>]: U } : never
  }[number]
>

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never

type EntityQueryResult<T extends readonly ComponentDefinition<any, any>[]> = Prettify<
  readonly [EntityId, Prettify<ComputeQuery<T>>][]
>

export class ECS<ComponentDefs extends readonly ComponentDefinition<any, any>[]> {
  private componentStores = new Map<string, Map<EntityId, any>>()
  private componentIndices = new Map<string, bigint>()
  private entityBitmasks = new Map<EntityId, bigint>()
  private nextComponentIndex = 0n
  private nextEntityId: EntityId = 0n

  private allowedComponents = new Map<string, ComponentDefinition<any, any>>()

  static create<ComponentDefs extends readonly ComponentDefinition<any, any>[]>(
    ...allowedComponents: ComponentDefs
  ): ECS<ComponentDefs> {
    const ecs = new ECS<ComponentDefs>()
    for (const componentDef of allowedComponents) {
      ecs.registerComponentType(componentDef)
    }
    return ecs
  }

  createEntity(...components: ComponentInstance<ComponentDefs[number]>[]): EntityId {
    const entity = this.nextEntityId++
    this.entityBitmasks.set(entity, 0n)
    for (const component of components) {
      this.addComponent(entity, component)
    }
    return entity
  }

  deleteEntity(entity: EntityId): void {
    for (const store of this.componentStores.values()) {
      store.delete(entity)
    }
    this.entityBitmasks.delete(entity)
  }

  addComponent(entity: EntityId, component: ComponentInstance<ComponentDefs[number]>): void {
    const tag = component[COMPONENT_TOKEN] as string
    const index = this.getComponentIndex(tag)

    if (!this.componentStores.has(tag)) {
      this.componentStores.set(tag, new Map<EntityId, typeof component>())
    }
    const store = this.componentStores.get(tag)!
    store.set(entity, component)

    const currentBitmask = this.entityBitmasks.get(entity) || 0n
    this.entityBitmasks.set(entity, currentBitmask | (1n << index))
  }

  removeComponent(entity: EntityId, component: ComponentDefs[number]): void {
    const index = this.getComponentIndex(component.type)
    const store = this.componentStores.get(component.type)
    store?.delete(entity)

    const currentBitmask = this.entityBitmasks.get(entity) || 0n
    this.entityBitmasks.set(entity, currentBitmask & ~(1n << index))
  }

  getComponent<T extends ComponentDefs[number]>(entity: EntityId, component: T): ComponentInstance<T> | undefined {
    const store = this.componentStores.get(component.type)
    return store?.get(entity) as ComponentInstance<T> | undefined
  }

  hasComponent(entity: EntityId, component: ComponentDefs[number]): boolean {
    const store = this.componentStores.get(component.type)
    return store?.has(entity) || false
  }

  queryEntities<T extends readonly ComponentDefs[number][]>(...componentDefs: T): EntityQueryResult<T> {
    const queryBitmask = componentDefs.reduce((bitmask, def) => {
      const index = this.getComponentIndex(def)
      return bitmask | (1n << index)
    }, 0n)

    const result: [EntityId, ComputeQuery<T>][] = []
    for (const [entity, bitmask] of this.entityBitmasks.entries()) {
      if ((bitmask & queryBitmask) !== queryBitmask) continue
      const entityComponents = {} as ComputeQuery<T>
      for (const def of componentDefs) {
        const component = this.getComponent(entity, def)
        if (!component) continue
        const key = pascalCaseToCamelCase(def.type) as keyof ComputeQuery<T>
        entityComponents[key] = component
      }
      result.push([entity, entityComponents])
    }
    return result as EntityQueryResult<T>
  }

  private registerComponentType<T extends ComponentDefs[number]>(componentDef: T): void {
    if (!this.componentIndices.has(componentDef.type)) {
      this.componentIndices.set(componentDef.type, this.nextComponentIndex++)
      this.allowedComponents.set(componentDef.type, componentDef)
    }
  }

  private getComponentIndex(component: ComponentDefs[number] | string): bigint {
    const type = typeof component === 'string' ? component : component.type
    const index = this.componentIndices.get(type)
    if (index === undefined) throw new Error(`Component type ${type} is not registered.`)
    return index
  }
}

export function defineComponent<T>(): <N extends string>(name: N) => ComponentDefinition<T, N> {
  return (name) => ({
    type: name,
    create: (data) => ({
      ...data,
      [COMPONENT_TOKEN]: name,
    }),
  })
}
