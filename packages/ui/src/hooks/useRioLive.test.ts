import { describe, it, expect } from 'bun:test'

describe('WS Connection Architecture', () => {
  it('App.tsx should mount WsConnection globally', async () => {
    const appContent = await Bun.file('./src/App.tsx').text()
    expect(appContent).toInclude('function WsConnection()')
    expect(appContent).toInclude('<WsConnection />')
    expect(appContent).toInclude("import { useRioLive }")
  })

  it('Navbar should show ConnectionIndicator', async () => {
    const navbarContent = await Bun.file('./src/components/layout/Navbar.tsx').text()
    expect(navbarContent).toInclude('ConnectionIndicator')
    expect(navbarContent).toInclude("useRioMundoStore(s => s.wsStatus)")
  })

  it('useRioLive should update wsStatus in store', async () => {
    const hookContent = await Bun.file('./src/hooks/useRioLive.ts').text()
    expect(hookContent).toInclude("setWsStatus('connected')")
    expect(hookContent).toInclude("setWsStatus('disconnected')")
  })

  it('RioMundoPage should show connection indicator always', async () => {
    const pageContent = await Bun.file('./src/pages/RioMundoPage.tsx').text()
    expect(pageContent).not.toInclude("{loginPhase === 'in_world' && (")
    expect(pageContent).toInclude('Connection status indicator')
  })

  it('useRioLive should NOT use correlationId', async () => {
    const hookContent = await Bun.file('./src/hooks/useRioLive.ts').text()
    expect(hookContent).not.toInclude('correlationId')
    expect(hookContent).not.toInclude('pendingRequests')
  })
})
