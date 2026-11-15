// @vitest-environment jsdom
/** A `.tex` file previews as the PDF compiled beside it, reloads when that PDF changes, and lists where it looked when there is none. */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { makeTranslate, RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import type { DocumentContent } from '../src/client/document/contract.ts'
import { DocumentPreviewRegistry } from '../src/client/document/registry.ts'
import type { DocumentFileBytes, ReadDocumentBytes, SessionFile } from '../src/client/rpc.ts'
import { pdfCandidates } from '../src/client/tex/candidates.ts'
import { texFace } from '../src/client/tex/face.ts'
import { apply } from '../src/client/tex/index.ts'
import { en, ja, es, fr, de, ru, pt, zh } from '../src/client/tex/locales.ts'
import { createTexStore, type TexView } from '../src/client/tex/store.ts'
import { TEX_BODY_ID, TexBody, type TexBodyProps } from '../src/client/tex/TexBody.tsx'
import { LazyPdfBody } from '../src/client/pdf/LazyPdfBody.tsx'
import { failureLine } from '../src/client/failure-line.ts'
import { en as documentEn } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

const SESSION = 's-1' as SessionId
const TAB = 'tab-1' as TabId
const MAIN: SessionFile = { sessionId: SESSION, path: 'paper/main.tex' }

function bytes(version: string, text = 'PDF'): DocumentFileBytes {
  return { absolutePath: `/ws/${version}.pdf`, version, offset: 0, eof: true, bytes: text.length, data: new TextEncoder().encode(text) }
}

/** A reader that serves the given paths and reports every other path as absent. */
function reader(files: Readonly<Record<string, DocumentFileBytes | RemoteError>>): ReadDocumentBytes & { readonly paths: string[] } {
  const paths: string[] = []
  const read = (async (file: SessionFile) => {
    paths.push(file.path)
    const found = files[file.path]
    if (found instanceof RemoteError) return { ok: false, error: found }
    return found === undefined
      ? { ok: false, error: new RemoteError('workspace-file/not-found', 'missing', { path: file.path }) }
      : { ok: true, value: found }
  }) as ReadDocumentBytes
  return Object.assign(read, { paths })
}

it('looks beside the source, in build/ and out/, then for the parent main.pdf', () => {
  expect(pdfCandidates('paper/main.tex')).toEqual(['paper/main.pdf', 'paper/build/main.pdf', 'paper/out/main.pdf', 'build/main.pdf', 'main.pdf'])
  expect(pdfCandidates('/ws/paper/sections/results.tex')).toEqual([
    '/ws/paper/sections/results.pdf', '/ws/paper/sections/build/results.pdf', '/ws/paper/sections/out/results.pdf',
    '/ws/paper/build/main.pdf', '/ws/paper/main.pdf',
  ])
  expect(pdfCandidates('thesis.ltx')).toEqual(['thesis.pdf', 'build/thesis.pdf', 'out/thesis.pdf'])
  expect(pdfCandidates('/thesis.tex')).toEqual(['/thesis.pdf', '/build/thesis.pdf', '/out/thesis.pdf', '/build/main.pdf', '/main.pdf'])
  expect(pdfCandidates('./a/../b/./x.tex')).toEqual(['b/x.pdf', 'b/build/x.pdf', 'b/out/x.pdf', 'build/main.pdf', 'main.pdf'])
})

function face(read: ReadDocumentBytes) {
  const instance = createTexStore().create()
  const injected = texFace(read, failure => `failed: ${failure.message}`)(SESSION, instance.actions)
  const view = (): TexView | undefined => instance.getSnapshot().byTab[TAB]
  return { instance, injected, view }
}

it('shows the first PDF that exists, watches it, and reports its version', async () => {
  const read = reader({ 'paper/build/main.pdf': bytes('v7') })
  const h = face(read)
  const loaded = vi.fn<(version: string) => void>()
  const failed = vi.fn()
  const watch = vi.fn<(path: string) => void>()
  h.injected.load(TAB, 3, MAIN, new AbortController().signal, loaded, failed, watch)
  await vi.waitFor(() => { expect(loaded).toHaveBeenCalledWith('v7') })
  expect(read.paths).toEqual(['paper/main.pdf', 'paper/build/main.pdf'])
  expect(h.view()).toMatchObject({ revision: 3, found: { path: 'paper/build/main.pdf', pdf: { version: 'v7' } } })
  expect(watch).toHaveBeenCalledExactlyOnceWith('paper/build/main.pdf')
  expect(failed).not.toHaveBeenCalled()
})

it('lists every path searched when no PDF exists, and stops at a read failure that is not an absent file', async () => {
  const none = face(reader({}))
  const failed = vi.fn()
  none.injected.load(TAB, 1, MAIN, new AbortController().signal, vi.fn(), failed, vi.fn())
  await vi.waitFor(() => { expect(failed).toHaveBeenCalledOnce() })
  expect(none.view()).toEqual({ revision: 1, searched: pdfCandidates(MAIN.path) })

  const denied = face(reader({ 'paper/main.pdf': new RemoteError('workspace-file/too-large', 'too big', { path: 'paper/main.pdf', limit: 1 }) }))
  const deniedFailed = vi.fn()
  denied.injected.load(TAB, 2, MAIN, new AbortController().signal, vi.fn(), deniedFailed, vi.fn())
  await vi.waitFor(() => { expect(deniedFailed).toHaveBeenCalledOnce() })
  expect(denied.view()).toEqual({ revision: 2, failure: { code: 'workspace-file/too-large', message: 'failed: too big' } })

  const thrown = face(async () => { throw new Error('socket closed') })
  const thrownFailed = vi.fn()
  thrown.injected.load(TAB, 4, MAIN, new AbortController().signal, vi.fn(), thrownFailed, vi.fn())
  await vi.waitFor(() => { expect(thrownFailed).toHaveBeenCalledOnce() })
  expect(thrown.view()?.failure).toEqual({ code: 'gateway/internal', message: 'failed: socket closed' })

  const odd = face(async () => { throw 'not an Error' })
  const oddFailed = vi.fn()
  odd.injected.load(TAB, 5, MAIN, new AbortController().signal, vi.fn(), oddFailed, vi.fn())
  await vi.waitFor(() => { expect(oddFailed).toHaveBeenCalledOnce() })
  expect(odd.view()?.failure?.message).toBe('failed: not an Error')
})

it('reports nothing for a cancelled lookup', async () => {
  const gate = Promise.withResolvers<undefined>()
  const read = (async () => { await gate.promise; return { ok: true, value: bytes('v1') } }) as ReadDocumentBytes
  const h = face(read)
  const controller = new AbortController()
  const loaded = vi.fn()
  const failed = vi.fn()
  h.injected.load(TAB, 1, MAIN, controller.signal, loaded, failed, vi.fn())
  controller.abort()
  gate.resolve(undefined)
  await gate.promise
  await Promise.resolve()
  expect(loaded).not.toHaveBeenCalled()
  expect(failed).not.toHaveBeenCalled()
  expect(h.view()).toEqual({ revision: 1 })
  h.injected.load(TAB, 2, MAIN, controller.signal, loaded, failed, vi.fn())
  expect(h.view()).toEqual({ revision: 1 })

  const rejecting = Promise.withResolvers<never>()
  const late = face(() => rejecting.promise)
  const cancel = new AbortController()
  late.injected.load(TAB, 1, MAIN, cancel.signal, loaded, failed, vi.fn())
  cancel.abort()
  rejecting.reject(new Error('aborted read'))
  await rejecting.promise.catch(() => undefined)
  await Promise.resolve()
  expect(failed).not.toHaveBeenCalled()
  expect(late.view()).toEqual({ revision: 1 })
})

function body(read: ReadDocumentBytes) {
  const store = createTexStore().create()
  const controller = new AbortController()
  const reload = vi.fn()
  const loaded = vi.fn()
  const addResource = vi.fn<(address: string) => void>()
  const content: DocumentContent = { kind: 'renderer', revision: 1, loaded, failed: vi.fn(), reload }
  const injected = texFace(read, failure => failure.message)(SESSION, store.actions)
  function useStore<T>(selector: (state: { byTab: Record<TabId, TexView> }) => T): T {
    return selector(useSyncExternalStore(listener => store.subscribe(listener), () => store.getSnapshot()))
  }
  const props = {
    ...injected,
    retainTab: vi.fn(),
    useTabInfo: () => ({ tab: { id: TAB, signal: controller.signal } }),
    useStore, actions: store.actions,
    resourceAddress: 'dsh-resource://file/session/s-1/paper/main.tex',
    content, wrap: false, scrollportRef: vi.fn(), addResource, setResources: vi.fn(),
    t: makeTranslate(en),
    renderSlot: (_name: string, child: { content: DocumentContent }) => (
      <p data-test-pdf>{child.content.kind === 'bytes' ? new TextDecoder().decode(child.content.data) : ''}</p>
    ),
  } as unknown as TexBodyProps
  return { props, reload, loaded, addResource, controller }
}

it('renders the found PDF through the nested PDF slot and names its path', async () => {
  const h = body(reader({ 'paper/build/main.pdf': bytes('v2', 'compiled paper') }))
  render(<TexBody {...h.props} />)
  expect(screen.getByRole('status').getAttribute('aria-label')).toBe(en.loading)
  expect(await screen.findByText('compiled paper')).toBeTruthy()
  expect(screen.getByText('Showing paper/build/main.pdf')).toBeTruthy()
  expect(h.loaded).toHaveBeenCalledWith('v2')
  expect(h.addResource).toHaveBeenCalledWith('dsh-resource://file/session/s-1/paper/build/main.pdf')
  h.controller.abort()
})

it('shows where it looked and retries through the owner when no PDF exists', async () => {
  const h = body(reader({}))
  render(<TexBody {...h.props} />)
  expect(await screen.findByText(en.missing)).toBeTruthy()
  expect(screen.getByRole('list', { name: en.searched }).textContent).toContain('paper/build/main.pdf')
  fireEvent.click(screen.getByRole('button', { name: en.retry }))
  expect(h.reload).toHaveBeenCalledOnce()
  h.controller.abort()
})

it('shows a read failure that is not an absent file without a path list', async () => {
  const h = body(reader({ 'paper/main.pdf': new RemoteError('workspace-file/too-large', 'The PDF is too large to preview.', { path: 'paper/main.pdf', limit: 1 }) }))
  const view = render(<TexBody {...h.props} />)
  expect(await screen.findByText('The PDF is too large to preview.')).toBeTruthy()
  expect(view.container.querySelector('[data-tex-preview]')?.getAttribute('data-tex-preview')).toBe('workspace-file/too-large')
  expect(screen.queryByRole('list')).toBeNull()
  h.controller.abort()
})

it('renders nothing for ordinary shared content', () => {
  const h = body(reader({}))
  const view = render(<TexBody {...h.props} content={{ kind: 'bytes', data: new Uint8Array() }} />)
  expect(view.container.childElementCount).toBe(0)
  h.controller.abort()
})

it('ranks the TeX preview first for .tex and .ltx, keeps code and text available, and removes every registration on dispose', async () => {
  const ctx = new Context()
  const registry = new DocumentPreviewRegistry()
  const removed = vi.fn()
  type Registered = {
    name: string
    key: string
    store?: ReturnType<typeof createTexStore>
    inject?: (session: SessionId, actions: ReturnType<ReturnType<typeof createTexStore>['create']>['actions']) => TexBodyProps
  }
  const register = vi.fn((_options: Registered, _component: unknown) => removed)
  const locale = { register: vi.fn(() => removed), bind: (name: string) => makeTranslate(name === 'sidebarTex' ? en : documentEn) }
  ctx.provide('documentPreviews', registry)
  ctx.provide('slots', { inject: (_name: string, effect: () => () => void) => effect(), register } as never)
  ctx.provide('locale', locale as never)
  const tooLarge = new RemoteError('workspace-file/too-large', 'too big', { path: 'paper/main.pdf', limit: 1 })
  const thrown: { error?: Error } = {}
  const read = (async () => {
    if (thrown.error === undefined) return { ok: false, error: tooLarge }
    throw thrown.error
  }) as ReadDocumentBytes
  const fiber = ctx.plugin({ apply: (scope: Context) => { apply(scope, read) } })
  await fiber.await()
  expect(locale.register).toHaveBeenCalledWith('sidebarTex', { zh, en, ja, es, fr, de, ru, pt })
  for (const path of ['main.tex', 'thesis.LTX']) {
    const [first] = registry.candidates(path)
    expect(first).toMatchObject({ id: TEX_BODY_ID, loading: 'renderer', wrap: false, priority: 'extension' })
    expect(first?.binaryExtensions).toBeUndefined()
    expect(first?.title()).toBe(en.title)
  }
  expect(register.mock.calls.map(([options, component]) => [options.name, options.key, component])).toEqual([
    ['sidebar.right.tab.document', TEX_BODY_ID, TexBody],
    ['sidebar.right.tab.document.tex.pdf', TEX_BODY_ID, LazyPdfBody],
  ])
  const options = register.mock.calls[0]![0]
  const instance = options.store!.create()
  const injected = options.inject!(SESSION, instance.actions)
  const tab = new AbortController()
  injected.retainTab(TAB, tab.signal)
  const failed = vi.fn()
  injected.load(TAB, 1, MAIN, new AbortController().signal, vi.fn(), failed, vi.fn())
  await vi.waitFor(() => { expect(failed).toHaveBeenCalledOnce() })
  expect(instance.getSnapshot().byTab[TAB]?.failure?.message).toBe(failureLine(makeTranslate(documentEn), tooLarge))
  thrown.error = new Error('connection reset')
  injected.load(TAB, 2, MAIN, new AbortController().signal, vi.fn(), failed, vi.fn())
  await vi.waitFor(() => { expect(failed).toHaveBeenCalledTimes(2) })
  expect(instance.getSnapshot().byTab[TAB]?.failure?.message).toBe(makeTranslate(documentEn)('error.unavailable', { message: 'connection reset' }))
  tab.abort()
  expect(instance.getSnapshot().byTab[TAB]).toBeUndefined()
  await act(async () => { await fiber.dispose() })
  expect(registry.getSnapshot()).toEqual([])
  expect(removed).toHaveBeenCalledTimes(3)
})

it('keeps every TeX dictionary on one key set', () => {
  for (const dictionary of [en, ja, es, fr, de, ru, pt]) expect(Object.keys(dictionary).sort()).toEqual(Object.keys(zh).sort())
})
