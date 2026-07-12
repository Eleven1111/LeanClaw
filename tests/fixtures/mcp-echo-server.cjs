const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const { z } = require('zod')

async function main() {
  const server = new McpServer({ name: 'echo-fixture', version: '1.0.0' })
  server.registerTool(
    'echo',
    {
      description: '将输入的文本原样返回，并加上前缀「echo: 」',
      inputSchema: { text: z.string() }
    },
    async ({ text }) => ({ content: [{ type: 'text', text: 'echo: ' + text }] })
  )
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  process.stderr.write(String(err && err.stack ? err.stack : err) + '\n')
  process.exit(1)
})
