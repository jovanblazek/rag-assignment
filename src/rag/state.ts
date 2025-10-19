import { type BaseMessage } from '@langchain/core/messages'
import z from 'zod'

export const MessagesStateSchema = z.object({
  messages: z
    .array(z.custom<BaseMessage>()),
    // .register(registry, MessagesZodMeta) // Causing TS issues, also not supported by zod v3
  llmCalls: z.number().optional(),
})

export type MessagesState = z.infer<typeof MessagesStateSchema>
