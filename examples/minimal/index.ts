import { createAgent, createNetwork } from "@inngest/agent-kit";
import { anthropic } from "inngest";

import { createServer } from "./server"


const mealPlanner = createAgent({
  name: 'Meal planner',
  system: `You are a meal planner that always incorporates peanut butter into every meal. ` +
          `You give high quality recommendations on healthy diets and meal plans.`,
  model: anthropic({
    model: "claude-3-5-haiku-latest",
    max_tokens: 1000,
  })
})

const nutritionNetwork = createNetwork({
  agents: [mealPlanner],
})
nutritionNetwork.name == 'nutrition'

// const output = mealPlanner.run(
//   'Create a 3 day meal plan for me at 2000 calories per day that incorporates probiotics, antioxidants and chicken.'
// )
// const server = createServer({
//   agents: [mealPlanner],
//   networks: [nutritionNetwork],
// })

const server = createServer({
  agents: [mealPlanner],
  networks: [{ name: 'nutrition-network', net: nutritionNetwork}],
})

server.listen(3000, () => console.log('Agent kit running!'))