import { ECS, defineComponent } from './ecs'

const Position = defineComponent<{ x: number; y: number }>()('Position')
const Velocity = defineComponent<{ dx: number; dy: number }>()('Velocity')
const Health = defineComponent<{ value: number }>()('Health')

const ecs = ECS.create(Position, Velocity, Health)

const a = ecs.createEntity(
  Position.create({ x: 10, y: 20 }),
  Velocity.create({ dx: 1, dy: 2 }),
  Health.create({ value: 100 }),
)
const b = ecs.createEntity(
  Position.create({ x: 30, y: 40 }),
  Velocity.create({ dx: 3, dy: 4 }),
  Health.create({ value: 200 }),
)
const c = ecs.createEntity(
  Position.create({ x: 50, y: 60 }),
  Velocity.create({ dx: 5, dy: 6 }),
  Health.create({ value: 300 }),
)

const query = ecs.queryEntities(Position, Health)
for (const [id, components] of query) {
  const { position, health } = components
  console.log(`Entity ${id} has Position(${position.x}, ${position.y}) and Health(${health.value})`)
  ecs.removeComponent(id, Position)
}

const aPosition = ecs.getComponent(a, Position)
const aVelocity = ecs.getComponent(a, Velocity)
const aHealth = ecs.getComponent(a, Health)
console.log(aPosition, aVelocity, aHealth)
