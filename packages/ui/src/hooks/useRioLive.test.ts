import { describe, it, expect } from 'bun:test'

describe('WS Connection Architecture', () => {
  it('App.tsx should mount WsConnection globally', async () => {
    const appContent = await Bun.file('./packages/ui/src/App.tsx').text()
    expect(appContent).toInclude('function WsConnection()')
    expect(appContent).toInclude('<WsConnection />')
    expect(appContent).toInclude("import { useRioLive }")
  })

  it('ConnectionIndicator is small WiFi-style bars with latency tooltip', async () => {
    const indicatorContent = await Bun.file('./packages/ui/src/components/ConnectionIndicator.tsx').text()
    expect(indicatorContent).toInclude('cursor-help')
    expect(indicatorContent).toInclude('title={title}')
    expect(indicatorContent).toInclude('h-3')
    expect(indicatorContent).toInclude('w-[3px]')
  })

  it('Navbar should import ConnectionIndicator', async () => {
    const navbarContent = await Bun.file('./packages/ui/src/components/layout/Navbar.tsx').text()
    expect(navbarContent).toInclude("import { ConnectionIndicator }")
  })

  it('useRioLive should update wsStatus in store', async () => {
    const hookContent = await Bun.file('./packages/ui/src/hooks/useRioLive.ts').text()
    expect(hookContent).toInclude("setWsStatus('connected')")
    expect(hookContent).toInclude("setWsStatus('disconnected')")
  })

  it('RioMundoPage should show connection indicator always', async () => {
    const pageContent = await Bun.file('./packages/ui/src/pages/RioMundoPage.tsx').text()
    expect(pageContent).not.toInclude("{loginPhase === 'in_world' && (")
    expect(pageContent).toInclude('Connection status indicator')
  })

  it('useRioLive should NOT use correlationId', async () => {
    const hookContent = await Bun.file('./packages/ui/src/hooks/useRioLive.ts').text()
    expect(hookContent).not.toInclude('correlationId')
    expect(hookContent).not.toInclude('pendingRequests')
  })
})
