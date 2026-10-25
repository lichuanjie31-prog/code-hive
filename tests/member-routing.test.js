import test from 'node:test'
import { articleAdminPlugin } from '../server/article-admin-plugin.js'

test('local article plugin passes membership administration routes to FastAPI', async () => {
  let handler
  articleAdminPlugin({ rootDir: process.cwd(), mode: 'development' }).configureServer({ middlewares: { use(value) { handler = value } } })
  for (const url of ['/api/admin/applications', '/api/admin/members/2/suspend', '/api/auth/login', '/api/competitions']) {
    await new Promise((resolve, reject) => {
      handler({ url, headers: {}, socket: {} }, { end() { reject(new Error('Article plugin intercepted membership API')) } }, resolve)
    })
  }
})
