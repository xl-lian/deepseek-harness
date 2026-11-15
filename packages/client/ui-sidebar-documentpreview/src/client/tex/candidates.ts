/** Where a LaTeX source's compiled PDF lives, in the order the TeX preview looks. */

/**
 * Drop `.` segments and fold `..` into the segment before it, keeping a leading `/`.
 * @param path - slash-separated path, absolute or relative.
 * @returns the normalized path; `..` beyond a relative path's start is kept.
 */
function normalize(path: string): string {
  const absolute = path.startsWith('/')
  const out: string[] = []
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..' && out.length > 0 && out[out.length - 1] !== '..') out.pop()
    else if (segment !== '..' || !absolute) out.push(segment)
  }
  return `${absolute ? '/' : ''}${out.join('/')}`
}

/**
 * Candidate PDF paths for a `.tex` file: beside it, in a `build/` or `out/`
 * directory beside it, then the parent's `main.pdf` in `build/` or beside it,
 * which covers a section file under a paper's `sections/` directory.
 * @param texPath - the source path, absolute or relative to the Session workspace.
 * @returns distinct candidate paths in lookup order, in the same form as `texPath`.
 */
export function pdfCandidates(texPath: string): string[] {
  const slash = texPath.lastIndexOf('/')
  const stem = texPath.slice(slash + 1).replace(/\.[^.]*$/u, '')
  // A source with no directory resolves against the workspace; one at the root keeps its leading slash.
  const near = (relative: string): string => normalize(slash === -1 ? relative : `${texPath.slice(0, slash)}/${relative}`)
  const paths = [`${stem}.pdf`, `build/${stem}.pdf`, `out/${stem}.pdf`, '../build/main.pdf', '../main.pdf'].map(near)
  return [...new Set(paths)].filter(path => path !== '' && !path.startsWith('..'))
}
