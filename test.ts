import { ECS, defineComponent } from './ecs'

const Position = defineComponent<{ x: number; y: number }>()('Position')
const Velocity = defineComponent<{ dx: number; dy: number }>()('Velocity')
const Health = defineComponent<{ value: number }>()('Health')

const ecs = ECS.create(Position, Velocity, Health)

ecs.createEntity(Position.create({ x: 10, y: 20 }), Velocity.create({ dx: 1, dy: 2 }), Health.create({ value: 100 }))
ecs.createEntity(Position.create({ x: 30, y: 40 }), Health.create({ value: 200 }))
ecs.createEntity(Position.create({ x: 50, y: 60 }), Velocity.create({ dx: 5, dy: 6 }), Health.create({ value: 300 }))

const query = ecs.queryEntities(Position, Velocity, Health)
for (const [id, components] of query) {
  const { position, health, velocity } = components
  console.log(id, position, health, velocity, '\n')
}

console.log('\n\n')

const queryWithOptionals = ecs.queryEntities([Position, Health], [Velocity])
for (const [id, components] of queryWithOptionals) {
  const { position, health, velocity } = components
  console.log(`Entity ${id} has Position(${position.x}, ${position.y}) and Health(${health.value})`)
  if (velocity) {
    console.log(`Entity velocity ${velocity.dx} ${velocity.dy}\n`)
  } else {
    console.log('No velocity\n')
  }
}
