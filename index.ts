type Prettify<T> = { [K in keyof T]: T[K] } & unknown

type PascalCaseToCamelCase<S> = S extends `${infer T}${infer U}` ? `${Lowercase<T>}${U}` : S

function pascalCaseToCamelCase<S extends string>(str: S): PascalCaseToCamelCase<S> {
  const firstChar = str.charAt(0).toLowerCase()
  const rest = str.slice(1)
  return `${firstChar}${rest}` as PascalCaseToCamelCase<S>
}

type Entity = bigint & {}

// biome-ignore lint/suspicious/noEmptyInterface: Marker interface for components
interface Component {}

type ComponentType<T extends Component, N extends string = string> = (abstract new (
  ...args: never[]
) => T) & { readonly _name: N }

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never

type ComputeQuery<T extends readonly ComponentType<any, any>[]> = UnionToIntersection<
  {
    [I in keyof T]: T[I] extends ComponentType<any, infer N>
      ? {
          [P in PascalCaseToCamelCase<N>]: T[I] extends ComponentType<infer U, any> ? U : never
        }
      : never
  }[number]
>

type EntityQueryResult<T extends ComponentType<any, any>[]> = Prettify<readonly [Entity, Prettify<ComputeQuery<T>>][]>

class ECS<RegisteredComponents extends Component> {
  private nextEntityId: Entity = 0n
  private componentStores = new Map<ComponentType<RegisteredComponents>, Map<Entity, RegisteredComponents>>()
  private componentIndices = new Map<ComponentType<RegisteredComponents>, bigint>()
  private entityBitmasks = new Map<Entity, bigint>()
  private nextComponentIndex = 0n

  private constructor() {}

  static create<Components extends Component[]>(
    allowedComponents: [...{ [K in keyof Components]: ComponentType<Components[K]> }],
  ): ECS<Components[number]> {
    const ecs = new ECS<Components[number]>()
    for (const componentType of allowedComponents) {
      ecs.registerComponentType(componentType)
    }
    return ecs
  }

  createEntity(...components: RegisteredComponents[]): Entity {
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

  addComponent<T extends RegisteredComponents>(entity: Entity, component: T): void {
    const componentType = component.constructor as ComponentType<T>
    const index = this.getComponentIndex(componentType)

    if (!this.componentStores.has(componentType)) {
      this.componentStores.set(componentType, new Map<Entity, T>())
    }
    const store = this.componentStores.get(componentType)!
    store.set(entity, component)

    const currentBitmask = this.entityBitmasks.get(entity) || 0n
    this.entityBitmasks.set(entity, currentBitmask | (1n << index))
  }

  removeComponent<T extends RegisteredComponents>(entity: Entity, componentType: ComponentType<T>): void {
    const index = this.getComponentIndex(componentType)
    const store = this.componentStores.get(componentType)
    store?.delete(entity)

    const currentBitmask = this.entityBitmasks.get(entity) || 0n
    this.entityBitmasks.set(entity, currentBitmask & ~(1n << index))
  }

  getComponent<T extends RegisteredComponents>(entity: Entity, componentType: ComponentType<T>): T | undefined {
    const store = this.componentStores.get(componentType)
    return store?.get(entity) as T | undefined
  }

  hasComponent<T extends RegisteredComponents>(entity: Entity, componentType: ComponentType<T>): boolean {
    const store = this.componentStores.get(componentType)
    return store?.has(entity) || false
  }

  queryEntities<T extends ComponentType<RegisteredComponents>[]>(...componentTypes: T): EntityQueryResult<T> {
    const queryBitmask = componentTypes.reduce((bitmask, type) => {
      const index = this.getComponentIndex(type)
      return bitmask | (1n << index)
    }, 0n)

    const result: [Entity, ComputeQuery<T>][] = []
    for (const [entity, bitmask] of this.entityBitmasks.entries()) {
      if ((bitmask & queryBitmask) !== queryBitmask) continue
      const entityComponents = {} as ComputeQuery<T>
      for (const componentType of componentTypes) {
        const component = this.getComponent(entity, componentType as ComponentType<RegisteredComponents>)
        if (!component) continue
        const name = pascalCaseToCamelCase(componentType.name) as keyof ComputeQuery<T>
        entityComponents[name] = component as any
      }
      result.push([entity, entityComponents])
    }
    return result as EntityQueryResult<T>
  }

  private registerComponentType<T extends RegisteredComponents>(
    componentType: ComponentType<T>,
  ): ECS<RegisteredComponents> {
    if (!this.componentIndices.has(componentType)) {
      this.componentIndices.set(componentType, this.nextComponentIndex++)
    }
    return this
  }

  private getComponentIndex<T extends RegisteredComponents>(componentType: ComponentType<T>): bigint {
    const index = this.componentIndices.get(componentType)
    if (index === undefined) {
      throw new Error(`Component type ${componentType.name} is not registered.`)
    }
    return index
  }
}

class Position implements Component {
  static readonly _name = 'Position'
  constructor(
    public x: number,
    public y: number,
  ) {}
}

class Velocity implements Component {
  static readonly _name = 'Velocity'
  constructor(
    public dx: number,
    public dy: number,
  ) {}
}

class Health implements Component {
  static readonly _name = 'Health'
  constructor(public value: number) {}
}

// Create ECS using the factory
const ecs = ECS.create([Position, Velocity, Health])

// Create entities
const entity1 = ecs.createEntity(new Position(0, 0), new Velocity(1, 1))
const entity2 = ecs.createEntity(new Position(10, 10), new Health(100))
const entity3 = ecs.createEntity(new Position(20, 20), new Velocity(2, 2))
const entity4 = ecs.createEntity(new Position(30, 30), new Health(80), new Velocity(3, 3))
const entity5 = ecs.createEntity(new Position(40, 40), new Health(60))

// Query entities
const entitiesWithPositionAndHealth = ecs.queryEntities(Position, Health)
console.table(entitiesWithPositionAndHealth)

for (const [id, components] of entitiesWithPositionAndHealth) {
  const { position, health } = components
  console.log(`Entity ${id} has Position(${position.x}, ${position.y}) and Health(${health.value})`)
}
