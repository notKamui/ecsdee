const COMPONENT_TOKEN = Symbol('component')

type Prettify<T> = { [K in keyof T]: T[K] } & unknown

type PascalCaseToCamelCase<S> = S extends `${infer T}${infer U}` ? `${Lowercase<T>}${U}` : S

function pascalCaseToCamelCase<S extends string>(str: S): PascalCaseToCamelCase<S> {
  const firstChar = str.charAt(0).toLowerCase()
  const rest = str.slice(1)
  return `${firstChar}${rest}` as PascalCaseToCamelCase<S>
}

type EntityId = bigint & {}

interface ComponentDefinition<T, N extends string = string> {
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

class ECS<ComponentDefs extends readonly ComponentDefinition<any, any>[]> {
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
    const tag = component[COMPONENT_TOKEN]
    const index = this.getComponentIndex(tag)

    if (!this.componentStores.has(tag)) {
      this.componentStores.set(tag, new Map<EntityId, typeof component>())
    }
    const store = this.componentStores.get(tag)!
    store.set(entity, component)

    const currentBitmask = this.entityBitmasks.get(entity) || 0n
    this.entityBitmasks.set(entity, currentBitmask | (1n << index))
  }

  removeComponent(tag: string, entity: EntityId): void {
    const index = this.getComponentIndex(tag)
    const store = this.componentStores.get(tag)
    store?.delete(entity)

    const currentBitmask = this.entityBitmasks.get(entity) || 0n
    this.entityBitmasks.set(entity, currentBitmask & ~(1n << index))
  }

  getComponent<T extends ComponentInstance<ComponentDefs[number]>>(entity: EntityId, tag: string): T | undefined {
    const store = this.componentStores.get(tag)
    return store?.get(entity) as T | undefined
  }

  hasComponent(tag: string, entity: EntityId): boolean {
    const store = this.componentStores.get(tag)
    return store?.has(entity) || false
  }

  queryEntities<T extends readonly ComponentDefinition<any, any>[]>(...componentDefs: T): EntityQueryResult<T> {
    const queryBitmask = componentDefs.reduce((bitmask, def) => {
      const index = this.getComponentIndex(def.type)
      return bitmask | (1n << index)
    }, 0n)

    const result: [EntityId, ComputeQuery<T>][] = []
    for (const [entity, bitmask] of this.entityBitmasks.entries()) {
      if ((bitmask & queryBitmask) !== queryBitmask) continue
      const entityComponents = {} as ComputeQuery<T>
      for (const def of componentDefs) {
        const component = this.getComponent(entity, def.type)
        if (!component) continue
        const key = pascalCaseToCamelCase(def.type) as keyof ComputeQuery<T>
        entityComponents[key] = component
      }
      result.push([entity, entityComponents])
    }
    return result as EntityQueryResult<T>
  }

  private registerComponentType<T extends ComponentDefinition<any, any>>(componentDef: T): void {
    if (!this.componentIndices.has(componentDef.type)) {
      this.componentIndices.set(componentDef.type, this.nextComponentIndex++)
      this.allowedComponents.set(componentDef.type, componentDef)
    }
  }

  private getComponentIndex(tag: string): bigint {
    const index = this.componentIndices.get(tag)
    if (index === undefined) {
      throw new Error(`Component type ${tag} is not registered.`)
    }
    return index
  }
}

function defineComponent<T>(): <N extends string>(name: N) => ComponentDefinition<T, N> {
  return (name) => ({
    type: name,
    create: (data) => ({
      ...data,
      [COMPONENT_TOKEN]: name,
    }),
  })
}

const Position = defineComponent<{ x: number; y: number }>()('Position')

const Velocity = defineComponent<{ dx: number; dy: number }>()('Velocity')

const Health = defineComponent<{ value: number }>()('Health')

const ecs = ECS.create(Position, Velocity, Health)

ecs.createEntity(Position.create({ x: 10, y: 20 }), Velocity.create({ dx: 1, dy: 2 }), Health.create({ value: 100 }))
ecs.createEntity(Position.create({ x: 30, y: 40 }), Velocity.create({ dx: 3, dy: 4 }), Health.create({ value: 200 }))
ecs.createEntity(Position.create({ x: 50, y: 60 }), Velocity.create({ dx: 5, dy: 6 }), Health.create({ value: 300 }))

const query = ecs.queryEntities(Position, Health)
for (const [id, components] of query) {
  const { position, health } = components
  console.log(`Entity ${id} has Position(${position.x}, ${position.y}) and Health(${health.value})`)
}
