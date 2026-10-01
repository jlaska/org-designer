import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { OrgChart } from '@/components/chart/OrgChart'
import { BreadcrumbBar } from '@/components/chart/BreadcrumbBar'
import { Sidebar } from '@/components/layout/Sidebar'
import { Toolbar } from '@/components/layout/Toolbar'

export default function App() {
  const loadBaseline = useAppStore((s) => s.loadBaseline)
  const loadScenario = useAppStore((s) => s.loadScenario)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const scenario = params.get('scenario')
    const viewRoot = params.get('viewRoot')

    loadBaseline()
      .then(() => {
        if (scenario) return loadScenario(scenario)
      })
      .then(() => {
        if (viewRoot) useAppStore.getState().setViewRoot(viewRoot)
      })
      .catch(console.error)
  }, [loadBaseline, loadScenario])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      <Toolbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <BreadcrumbBar />
          <main className="flex-1 overflow-hidden">
            <OrgChart />
          </main>
        </div>
      </div>
      <footer className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-1.5">
        <span className="text-[10px] text-gray-400">
          v{__APP_VERSION__}
          <span className="ml-1 text-gray-300">({__GIT_HASH__})</span>
        </span>
        <a
          href="https://github.com/jlaska/org-designer"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 transition-colors hover:text-gray-600"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
          </svg>
        </a>
      </footer>
    </div>
  )
}
