type Prettify<T> = { [K in keyof T]: T[K] } & unknown

type PascalCaseToCamelCase<S> = S extends `${infer T}${infer U}` ? `${Lowercase<T>}${U}` : S

function pascalCaseToCamelCase<S extends string>(str: S): PascalCaseToCamelCase<S> {
  const firstChar = str.charAt(0).toLowerCase()
  const rest = str.slice(1)
  return `${firstChar}${rest}` as PascalCaseToCamelCase<S>
}

type Entity = bigint

type ComponentType<T, N extends string = string> = (abstract new (
  ...args: never[]
) => T) & {
  readonly [ECS.Component]: N
}

type ComponentInstance<C extends ComponentType<any, any>> = InstanceType<C>

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never

type ComputeQuery<T extends readonly ComponentType<any, any>[]> = UnionToIntersection<
  {
    [I in keyof T]: T[I] extends ComponentType<infer U, infer N> ? { [P in PascalCaseToCamelCase<N>]: U } : never
  }[number]
>

type EntityQueryResult<T extends readonly ComponentType<any, any>[]> = Prettify<
  readonly [Entity, Prettify<ComputeQuery<T>>][]
>

class ECS<ComponentTypes extends readonly ComponentType<any, any>[]> {
  static readonly Component: symbol = Symbol('ECS-Component')

  private nextEntityId: Entity = 0n
  private componentStores = new Map<ComponentType<any, any>, Map<Entity, any>>()
  private componentIndices = new Map<ComponentType<any, any>, bigint>()
  private entityBitmasks = new Map<Entity, bigint>()
  private nextComponentIndex = 0n

  private constructor() {}

  static create<ComponentTypes extends readonly ComponentType<any, any>[]>(
    allowedComponents: [...ComponentTypes],
  ): ECS<ComponentTypes> {
    const ecs = new ECS()
    for (const componentType of allowedComponents) {
      ecs.registerComponentType(componentType)
    }
    return ecs
  }

  createEntity(...components: ComponentInstance<ComponentTypes[number]>[]): Entity {
    const entity = this.nextEntityId++
    this.entityBitmasks.set(entity, 0n)
    for (const component of components) {
      this.addComponent(entity, component)
    }
    return entity
  }

  deleteEntity(entity: Entity): void {
    for (const store of this.componentStores.values()) {
      store.delete(entity)
    }
    this.entityBitmasks.delete(entity)
  }

  addComponent<T extends ComponentTypes[number]>(entity: Entity, component: ComponentInstance<T>): void {
    const componentType = component.constructor as T
    const index = this.getComponentIndex(componentType)

    if (!this.componentStores.has(componentType)) {
      this.componentStores.set(componentType, new Map<Entity, ComponentInstance<T>>())
    }
    const store = this.componentStores.get(componentType)!
    store.set(entity, component)

    const currentBitmask = this.entityBitmasks.get(entity) || 0n
    this.entityBitmasks.set(entity, currentBitmask | (1n << index))
  }

  removeComponent<T extends ComponentTypes[number]>(entity: Entity, componentType: T): void {
    const index = this.getComponentIndex(componentType)
    const store = this.componentStores.get(componentType)
    store?.delete(entity)

    const currentBitmask = this.entityBitmasks.get(entity) || 0n
    this.entityBitmasks.set(entity, currentBitmask & ~(1n << index))
  }

  getComponent<T extends ComponentTypes[number]>(entity: Entity, componentType: T): ComponentInstance<T> | undefined {
    const store = this.componentStores.get(componentType)
    return store?.get(entity) as ComponentInstance<T> | undefined
  }

  hasComponent<T extends ComponentTypes[number]>(entity: Entity, componentType: T): boolean {
    const store = this.componentStores.get(componentType)
    return store?.has(entity) || false
  }

  queryEntities<T extends readonly ComponentType<any, any>[]>(...componentTypes: T): EntityQueryResult<T> {
    const queryBitmask = componentTypes.reduce((bitmask, type) => {
      const index = this.getComponentIndex(type)
      return bitmask | (1n << index)
    }, 0n)

    const result: [Entity, ComputeQuery<T>][] = []
    for (const [entity, bitmask] of this.entityBitmasks.entries()) {
      if ((bitmask & queryBitmask) !== queryBitmask) continue
      const entityComponents = {} as ComputeQuery<T>
      for (const componentType of componentTypes) {
        const component = this.getComponent(entity, componentType)
        if (!component) continue
        const name = pascalCaseToCamelCase(componentType.name) as keyof ComputeQuery<T>
        entityComponents[name] = component
      }
      result.push([entity, entityComponents])
    }
    return result as EntityQueryResult<T>
  }

  private registerComponentType<T extends ComponentType<any, any>>(componentType: T): void {
    if (!this.componentIndices.has(componentType)) {
      this.componentIndices.set(componentType, this.nextComponentIndex++)
    }
  }

  private getComponentIndex<T extends ComponentType<any, any>>(componentType: T): bigint {
    const index = this.componentIndices.get(componentType)
    if (index === undefined) {
      throw new Error(`Component type ${String(componentType[ECS.Component])} is not registered.`)
    }
    return index
  }
}

class Position {
  static readonly [ECS.Component] = 'Position'
  constructor(
    public x: number,
    public y: number,
  ) {}
}
class Velocity {
  static readonly [ECS.Component] = 'Velocity'
  constructor(
    public dx: number,
    public dy: number,
  ) {}
}
class Health {
  static readonly [ECS.Component] = 'Health'
  constructor(public value: number) {}
}

const ecs = ECS.create([Position, Velocity, Health])

ecs.createEntity(new Position(0, 0), new Velocity(1, 1))
ecs.createEntity(new Position(10, 10), new Health(100))
ecs.createEntity(new Position(20, 20), new Velocity(2, 2))
ecs.createEntity(new Position(30, 30), new Health(80), new Velocity(3, 3))
ecs.createEntity(new Position(40, 40), new Health(60))

const entitiesWithPositionAndHealth = ecs.queryEntities(Position, Health)
console.table(entitiesWithPositionAndHealth)

for (const [id, components] of entitiesWithPositionAndHealth) {
  const { position, health } = components
  console.log(`Entity ${id} has Position(${position.x}, ${position.y}) and Health(${health.value})`)
}
