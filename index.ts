type Entity = number;

// biome-ignore lint/suspicious/noEmptyInterface: Marker interface for components
interface Component {}

type ComponentType<T extends Component> = abstract new (...args: any[]) => T;

class ComponentStorage<T extends Component> {
  private components = new Map<Entity, T>();

  add(entity: Entity, component: T): void {
    this.components.set(entity, component);
  }

  get(entity: Entity): T | undefined {
    return this.components.get(entity);
  }

  remove(entity: Entity): void {
    this.components.delete(entity);
  }

  has(entity: Entity): boolean {
    return this.components.has(entity);
  }

  keys(): IterableIterator<Entity> {
    return this.components.keys();
  }
}

class ECS<RegisteredComponents extends Component> {
  private nextEntityId: Entity = 0;
  private componentStores = new Map<ComponentType<RegisteredComponents>, ComponentStorage<RegisteredComponents>>();
  private componentIndices = new Map<ComponentType<RegisteredComponents>, bigint>();
  private entityBitmasks = new Map<Entity, bigint>();
  private nextComponentIndex = 0n;

  private constructor() {}

  static create<Components extends Component[]>(
    allowedComponents: [...{ [K in keyof Components]: ComponentType<Components[K]> }]
  ): ECS<Components[number]> {
    const ecs = new ECS<Components[number]>();
    for (const componentType of allowedComponents) {
      ecs.registerComponentType(componentType);
    }
    return ecs;
  }

  createEntity(...components: RegisteredComponents[]): Entity {
    const entity = this.nextEntityId++;
    this.entityBitmasks.set(entity, 0n);
    for (const component of components) {
      this.addComponent(entity, component);
    }
    return entity;
  }

  deleteEntity(entity: Entity): void {
    for (const store of this.componentStores.values()) {
      store.remove(entity);
    }
    this.entityBitmasks.delete(entity);
  }

  addComponent<T extends RegisteredComponents>(entity: Entity, component: T): void {
    const componentType = component.constructor as ComponentType<T>;
    const index = this.getComponentIndex(componentType);

    if (!this.componentStores.has(componentType)) {
      this.componentStores.set(componentType, new ComponentStorage<T>());
    }
    const store = this.componentStores.get(componentType)!;
    store.add(entity, component);

    const currentBitmask = this.entityBitmasks.get(entity) || 0n;
    this.entityBitmasks.set(entity, currentBitmask | (1n << index));
  }

  removeComponent<T extends RegisteredComponents>(entity: Entity, componentType: ComponentType<T>): void {
    const index = this.getComponentIndex(componentType);
    const store = this.componentStores.get(componentType);
    store?.remove(entity);

    const currentBitmask = this.entityBitmasks.get(entity) || 0n;
    this.entityBitmasks.set(entity, currentBitmask & ~(1n << index));
  }

  getComponent<T extends RegisteredComponents>(entity: Entity, componentType: ComponentType<T>): T | undefined {
    const store = this.componentStores.get(componentType);
    return store?.get(entity) as T | undefined;
  }

  hasComponent<T extends RegisteredComponents>(entity: Entity, componentType: ComponentType<T>): boolean {
    const store = this.componentStores.get(componentType);
    return store?.has(entity) || false;
  }

  queryEntities(componentTypes: ComponentType<RegisteredComponents>[]): Entity[] {
    const queryBitmask = componentTypes.reduce((bitmask, type) => {
      const index = this.getComponentIndex(type);
      return bitmask | (1n << index);
    }, 0n);

    const result: Entity[] = [];
    for (const [entity, bitmask] of this.entityBitmasks.entries()) {
      if ((bitmask & queryBitmask) === queryBitmask) {
        result.push(entity);
      }
    }
    return result;
  }

  private registerComponentType<T extends RegisteredComponents>(componentType: ComponentType<T>): ECS<RegisteredComponents> {
    if (!this.componentIndices.has(componentType)) {
      this.componentIndices.set(componentType, this.nextComponentIndex++);
    }
    return this;
  }

  private getComponentIndex<T extends RegisteredComponents>(componentType: ComponentType<T>): bigint {
    const index = this.componentIndices.get(componentType);
    if (index === undefined) {
      throw new Error(`Component type ${componentType.name} is not registered.`);
    }
    return index;
  }
}

class Position implements Component {
  constructor(public x: number, public y: number) {}
}

class Velocity implements Component {
  constructor(public dx: number, public dy: number) {}
}

class Health implements Component {
  constructor(public value: number) {}
}

// Create ECS using the factory
const ecs = ECS.create([Position, Velocity, Health]);

// Create entities
const entity1 = ecs.createEntity(new Position(0, 0), new Velocity(1, 1));
const entity2 = ecs.createEntity(new Position(10, 10), new Health(100));

// Query entities
const entitiesWithPosition = ecs.queryEntities([Position]);
console.log(entitiesWithPosition); // [entity1, entity2]

const entitiesWithPositionAndVelocity = ecs.queryEntities([Position, Velocity]);
console.log(entitiesWithPositionAndVelocity); // [entity1]

for (const entity of ecs.queryEntities([Position, Health])) {
  const position = ecs.getComponent(entity, Position);
  const health = ecs.getComponent(entity, Health);
  if (position && health) {
    console.log(`Entity ${entity} has position (${position.x}, ${position.y}) and health ${health.value}`);
  }
}
