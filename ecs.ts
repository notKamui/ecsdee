import { type PascalCaseToCamelCase, type Prettify, type UnionToIntersection, pascalCaseToCamelCase } from './utils'

const COMPONENT_TOKEN = Symbol('component')

export type EntityId = bigint & {}

export interface ComponentDefinition<T = any, N extends string = string> {
  readonly type: N
  create: (data: T) => T & { readonly [COMPONENT_TOKEN]: N }
}

export type ComponentInstance<C extends ComponentDefinition> = ReturnType<C['create']>

type ComputeQuery<T extends readonly ComponentDefinition[]> = UnionToIntersection<
  {
    [I in keyof T]: T[I] extends ComponentDefinition<infer U, infer N> ? { [P in PascalCaseToCamelCase<N>]: U } : never
  }[number]
>

type OptionalComputeQuery<T extends readonly ComponentDefinition[]> = UnionToIntersection<
  {
    [I in keyof T]: T[I] extends ComponentDefinition<infer U, infer N> ? { [P in PascalCaseToCamelCase<N>]?: U } : never
  }[number]
>

export type EntityQueryResult<R extends readonly ComponentDefinition[]> = ReadonlyArray<
  [EntityId, Prettify<ComputeQuery<R>>]
>

export type EntityQueryResultWithOptionals<
  R extends readonly ComponentDefinition[],
  O extends readonly ComponentDefinition[],
> = ReadonlyArray<[EntityId, Prettify<ComputeQuery<R> & OptionalComputeQuery<O>>]>

export class ECS<ComponentDefinitions extends readonly ComponentDefinition[]> {
  private componentStores = new Map<string, Map<EntityId, any>>()
  private componentIndices = new Map<string, bigint>()
  private entityBitmasks = new Map<EntityId, bigint>()
  private nextComponentIndex = 0n
  private nextEntityId: EntityId = 0n

  static create<ComponentDefs extends readonly ComponentDefinition[]>(...allowed: ComponentDefs): ECS<ComponentDefs> {
    const ecs = new ECS<ComponentDefs>()
    for (const def of allowed) ecs.registerComponentType(def)
    return ecs
  }

  createEntity(...components: ComponentInstance<ComponentDefinitions[number]>[]): EntityId {
    const e = this.nextEntityId++
    this.entityBitmasks.set(e, 0n)
    for (const comp of components) this.addComponent(e, comp)
    return e
  }

  addComponent(e: EntityId, component: ComponentInstance<ComponentDefinitions[number]>): void {
    const tag = component[COMPONENT_TOKEN] as string
    const idx = this.getComponentIndex(tag)
    if (!this.componentStores.has(tag)) this.componentStores.set(tag, new Map())
    this.componentStores.get(tag)!.set(e, component)
    const mask = this.entityBitmasks.get(e) ?? 0n
    this.entityBitmasks.set(e, mask | (1n << idx))
  }

  deleteEntity(e: EntityId): void {
    for (const store of this.componentStores.values()) store.delete(e)
    this.entityBitmasks.delete(e)
  }

  removeComponent(e: EntityId, def: ComponentDefinitions[number]): void {
    const tag = def.type
    const idx = this.getComponentIndex(tag)
    this.componentStores.get(tag)?.delete(e)
    const mask = this.entityBitmasks.get(e) ?? 0n
    this.entityBitmasks.set(e, mask & ~(1n << idx))
  }

  getComponent<C extends ComponentDefinition>(e: EntityId, def: C): ComponentInstance<C> | undefined {
    return this.componentStores.get(def.type)?.get(e) as ComponentInstance<C> | undefined
  }

  hasComponent(e: EntityId, def: ComponentDefinitions[number]): boolean {
    return this.componentStores.get(def.type)?.has(e) ?? false
  }

  queryEntities<Req extends readonly ComponentDefinitions[number][]>(...required: Req): EntityQueryResult<Req>
  queryEntities<
    Req extends readonly ComponentDefinitions[number][],
    Opt extends readonly ComponentDefinitions[number][],
  >(required: readonly [...Req], optional: readonly [...Opt]): EntityQueryResultWithOptionals<Req, Opt>
  queryEntities(
    first: ComponentDefinitions[number] | readonly ComponentDefinitions[number][],
    second?: readonly ComponentDefinitions[number][],
  ): any {
    let reqDefs: ComponentDefinition[]
    let optDefs: ComponentDefinition[] = []

    if (Array.isArray(first)) {
      reqDefs = first as ComponentDefinition[]
      if (Array.isArray(second)) optDefs = second as ComponentDefinition[]
    } else {
      // biome-ignore lint/style/noArguments:
      reqDefs = Array.from(arguments) as ComponentDefinition[]
    }

    const reqMask = reqDefs.reduce((m, d) => m | (1n << this.getComponentIndex(d.type)), 0n)

    const out: [EntityId, any][] = []
    for (const [e, bm] of this.entityBitmasks.entries()) {
      if ((bm & reqMask) !== reqMask) continue
      const record: any = {}
      for (const def of reqDefs) {
        record[pascalCaseToCamelCase(def.type)] = this.getComponent(e, def)!
      }
      for (const def of optDefs) {
        record[pascalCaseToCamelCase(def.type)] = this.getComponent(e, def)
      }
      out.push([e, record])
    }

    return out
  }

  private registerComponentType(def: ComponentDefinitions[number]): void {
    if (!this.componentIndices.has(def.type)) {
      this.componentIndices.set(def.type, this.nextComponentIndex++)
    }
  }

  private getComponentIndex(tag: string): bigint {
    const idx = this.componentIndices.get(tag)
    if (idx === undefined) throw new Error(`Component ${tag} not registered.`)
    return idx
  }
}

export function defineComponent<T>(): <N extends string>(name: N) => ComponentDefinition<T, N> {
  return (name) => ({ type: name, create: (data) => ({ ...data, [COMPONENT_TOKEN]: name }) })
}
