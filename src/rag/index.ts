import '../environment'
import { createAgent, UserInput, SystemMessage } from 'langchain'
import { retrieveTool } from './tools/retrieve'

const tools = [retrieveTool]
const systemPrompt = new SystemMessage(
  'You have access to a tool that retrieves context from a consulting decks. Use the tool to help answer user queries.'
)

const agent = createAgent({
  model: 'openai:gpt-5-mini',
  tools,
  systemPrompt: systemPrompt.text,
})

const main = async () => {
  const inputMessage = `Tell me about Roche's strategic transaction regarding Foundation Medicine`

  const stream = await agent.stream(
    {
      messages: [{ role: 'human', content: inputMessage }],
    },
    {
      streamMode: 'values',
    }
  )
  for await (const chunk of stream) {
    const lastMessage = chunk.messages[chunk.messages.length - 1]
    console.log(
      `[${lastMessage.type} - ${lastMessage.name}]: ${lastMessage.content}`
    )
    console.log('-----\n')
  }
}

main()
