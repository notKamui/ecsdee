type Entity = number;

// biome-ignore lint/suspicious/noEmptyInterface: Marker interface for components
interface Component {}

type ComponentType<T extends Component> = new (...args: any[]) => T;

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

  keys(): MapIterator<number> {
    return this.components.keys();
  }
}

class ECS {
  private nextEntityId: Entity = 0;

  private componentStores = new Map<ComponentType<any>, ComponentStorage<any>>();

  createEntity(): Entity {
    return this.nextEntityId++;
  }

  deleteEntity(entity: Entity): void {
    for (const store of this.componentStores.values()) {
      store.remove(entity);
    }
  }

  addComponent<T extends Component>(entity: Entity, component: T): void {
    const componentType = component.constructor as ComponentType<T>;
    if (!this.componentStores.has(componentType)) {
      this.componentStores.set(componentType, new ComponentStorage<T>());
    }
    const store = this.componentStores.get(componentType)!;
    store.add(entity, component);
  }

  getComponent<T extends Component>(entity: Entity, componentType: ComponentType<T>): T | undefined {
    const store = this.componentStores.get(componentType);
    return store?.get(entity);
  }

  removeComponent<T extends Component>(entity: Entity, componentType: ComponentType<T>): void {
    const store = this.componentStores.get(componentType);
    store?.remove(entity);
  }

  hasComponent<T extends Component>(entity: Entity, componentType: ComponentType<T>): boolean {
    const store = this.componentStores.get(componentType);
    return store?.has(entity) || false;
  }

  queryEntities(componentTypes: ComponentType<Component>[]): Entity[] {
    const sets = componentTypes.map((type) => {
      const store = this.componentStores.get(type);
      return store ? new Set(store.keys()) : new Set<Entity>();
    });

    if (sets.length === 0) return [];

    return Array.from(sets.reduce((acc, next) => {
      const intersection = new Set<Entity>();
      for (const x of acc) {
        if (next.has(x)) intersection.add(x);
      }
      return intersection;
    }));
  }
}

// Example usage:

// Define components
class Position implements Component {
  constructor(public x: number, public y: number) {}
}

class Velocity implements Component {
  constructor(public dx: number, public dy: number) {}
}

// Create ECS instance
const ecs = new ECS();

// Create entities
const entity1 = ecs.createEntity();
const entity2 = ecs.createEntity();

// Add components to entities
ecs.addComponent(entity1, new Position(0, 0));
ecs.addComponent(entity1, new Velocity(1, 1));
ecs.addComponent(entity2, new Position(10, 10));

// Query entities with specific components
const entitiesWithPosition = ecs.queryEntities([Position]);
console.log(entitiesWithPosition); // [entity1, entity2]

const entitiesWithPositionAndVelocity = ecs.queryEntities([Position, Velocity]);
console.log(entitiesWithPositionAndVelocity); // [entity1]

for (const entity of entitiesWithPositionAndVelocity) {
  const position = ecs.getComponent(entity, Position);
  const velocity = ecs.getComponent(entity, Velocity);
  if (position && velocity) {
    position.x += velocity.dx;
    position.y += velocity.dy;
    console.log(`Entity ${entity} moved to (${position.x}, ${position.y})`);
  }
}
