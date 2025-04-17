import { type PascalCaseToCamelCase, type Prettify, type UnionToIntersection, pascalCaseToCamelCase } from './utils'

const COMPONENT_TOKEN = Symbol('component')

export type EntityId = bigint & {}

export interface ComponentDefinition<T, N extends string = string> {
  readonly type: N
  create: (data: T) => T & { readonly [COMPONENT_TOKEN]: N }
}

export type ComponentInstance<C extends ComponentDefinition<any, any>> = ReturnType<C['create']>

type ComputeQuery<T extends readonly ComponentDefinition<any, any>[]> = UnionToIntersection<
  {
    [I in keyof T]: T[I] extends ComponentDefinition<infer U, infer N> ? { [P in PascalCaseToCamelCase<N>]: U } : never
  }[number]
>

export type EntityQueryResult<T extends readonly ComponentDefinition<any, any>[]> = Prettify<
  readonly [EntityId, Prettify<ComputeQuery<T>>][]
>

type CompDef = ComponentDefinition<any, any>

export class ECS<ComponentDefs extends readonly ComponentDefinition<any, any>[]> {
  private componentStores = new Map<string, Map<EntityId, any>>()
  private componentIndices = new Map<string, bigint>()
  private entityBitmasks = new Map<EntityId, bigint>()
  private nextComponentIndex = 0n
  private nextEntityId: EntityId = 0n

  private allowedComponents = new Map<string, CompDef>()

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
    this.componentStores.get(tag)!.set(entity, component)

    const currentBitmask = this.entityBitmasks.get(entity) || 0n
    this.entityBitmasks.set(entity, currentBitmask | (1n << index))
  }

  removeComponent(entity: EntityId, component: ComponentDefs[number]): void {
    const index = this.getComponentIndex(component.type)
    this.componentStores.get(component.type)?.delete(entity)

    const currentBitmask = this.entityBitmasks.get(entity) || 0n
    this.entityBitmasks.set(entity, currentBitmask & ~(1n << index))
  }

  getComponent<C extends CompDef>(entity: EntityId, component: C): ComponentInstance<C> | undefined {
    return this.componentStores.get(component.type)?.get(entity) as ComponentInstance<C> | undefined
  }

  hasComponent(entity: EntityId, component: ComponentDefs[number]): boolean {
    return this.componentStores.get(component.type)?.has(entity) || false
  }

  // Overload 1: only required
  queryEntities<R extends readonly ComponentDefs[number][]>(...required: R): EntityQueryResult<R>

  // Overload 2: required + optional
  queryEntities<R extends readonly ComponentDefs[number][], O extends readonly ComponentDefs[number][]>(
    required: [...R],
    optional: [...O],
  ): EntityQueryResult<R & O>

  // Implementation
  queryEntities(reqOrFirst: unknown, optOrSecond?: unknown): any {
    let required: CompDef[]
    let optional: CompDef[]

    if (Array.isArray(reqOrFirst)) {
      // Called with arrays: queryEntities(requiredArray, optionalArray?)
      required = reqOrFirst as CompDef[]
      optional = Array.isArray(optOrSecond) ? (optOrSecond as CompDef[]) : []
    } else {
      // Called with rest args: queryEntities(def1, def2, ...)
      required = Array.from(arguments) as CompDef[]
      optional = []
    }

    // Filter mask: entity must have all required components
    const requiredMask = required.reduce((mask, def) => mask | (1n << this.getComponentIndex(def.type)), 0n)

    const result: [EntityId, any][] = []
    for (const [entity, bitmask] of this.entityBitmasks.entries()) {
      if ((bitmask & requiredMask) !== requiredMask) continue
      const record: any = {}

      // Populate required
      for (const def of required) {
        const comp = this.getComponent(entity, def)!
        record[pascalCaseToCamelCase(def.type)] = comp
      }

      // Populate optional
      for (const def of optional) {
        const comp = this.getComponent(entity, def)
        record[pascalCaseToCamelCase(def.type)] = comp
      }

      result.push([entity, record])
    }

    return result as any
  }

  private registerComponentType(componentDef: CompDef): void {
    if (!this.componentIndices.has(componentDef.type)) {
      this.componentIndices.set(componentDef.type, this.nextComponentIndex++)
      this.allowedComponents.set(componentDef.type, componentDef)
    }
  }

  private getComponentIndex(type: string): bigint {
    const idx = this.componentIndices.get(type)
    if (idx === undefined) {
      throw new Error(`Component type ${type} is not registered.`)
    }
    return idx
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
