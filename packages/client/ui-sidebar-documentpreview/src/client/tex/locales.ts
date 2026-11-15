/** TeX preview copy: the compiled PDF a `.tex` file is shown as, and what happens when none is found. */
export const zh = {
  title: 'TeX（编译后的 PDF）',
  loading: '正在查找编译后的 PDF...',
  showing: '显示 {path}',
  missing: '此文件旁没有编译后的 PDF。用 LaTeX 工具编译后点击重试。已查找：',
  searched: '已查找的路径',
  retry: '重试',
} satisfies Record<string, string>

/** TeX preview locale keys. */
export type TexPreviewKey = keyof typeof zh

/** English translations checked against the Chinese key set. */
export const en = {
  title: 'TeX (compiled PDF)',
  loading: 'Looking for the compiled PDF...',
  showing: 'Showing {path}',
  missing: 'No compiled PDF next to this file. Build it with your LaTeX tool, then retry. Looked for:',
  searched: 'Paths searched',
  retry: 'Retry',
} satisfies Record<TexPreviewKey, string>

/** Japanese translations checked against the Chinese key set. */
export const ja = {
  title: 'TeX（コンパイル済み PDF）',
  loading: 'コンパイル済み PDF を探しています...',
  showing: '{path} を表示中',
  missing: 'このファイルの近くにコンパイル済み PDF がありません。LaTeX ツールでビルドしてから再試行してください。検索したパス：',
  searched: '検索したパス',
  retry: '再試行',
} satisfies Record<TexPreviewKey, string>

/** Spanish translations checked against the Chinese key set. */
export const es = {
  title: 'TeX (PDF compilado)',
  loading: 'Buscando el PDF compilado...',
  showing: 'Mostrando {path}',
  missing: 'No hay un PDF compilado junto a este archivo. Compílalo con tu herramienta de LaTeX y vuelve a intentarlo. Rutas buscadas:',
  searched: 'Rutas buscadas',
  retry: 'Reintentar',
} satisfies Record<TexPreviewKey, string>

/** French translations checked against the Chinese key set. */
export const fr = {
  title: 'TeX (PDF compilé)',
  loading: 'Recherche du PDF compilé...',
  showing: 'Affichage de {path}',
  missing: 'Aucun PDF compilé à côté de ce fichier. Compilez-le avec votre outil LaTeX, puis réessayez. Chemins recherchés :',
  searched: 'Chemins recherchés',
  retry: 'Réessayer',
} satisfies Record<TexPreviewKey, string>

/** German translations checked against the Chinese key set. */
export const de = {
  title: 'TeX (kompiliertes PDF)',
  loading: 'Kompiliertes PDF wird gesucht...',
  showing: '{path} wird angezeigt',
  missing: 'Neben dieser Datei liegt kein kompiliertes PDF. Erstellen Sie es mit Ihrem LaTeX-Werkzeug und versuchen Sie es erneut. Gesuchte Pfade:',
  searched: 'Gesuchte Pfade',
  retry: 'Erneut versuchen',
} satisfies Record<TexPreviewKey, string>

/** Russian translations checked against the Chinese key set. */
export const ru = {
  title: 'TeX (скомпилированный PDF)',
  loading: 'Поиск скомпилированного PDF...',
  showing: 'Показан {path}',
  missing: 'Рядом с этим файлом нет скомпилированного PDF. Соберите его с помощью LaTeX и повторите попытку. Проверенные пути:',
  searched: 'Проверенные пути',
  retry: 'Повторить',
} satisfies Record<TexPreviewKey, string>

/** Portuguese translations checked against the Chinese key set. */
export const pt = {
  title: 'TeX (PDF compilado)',
  loading: 'Procurando o PDF compilado...',
  showing: 'Mostrando {path}',
  missing: 'Não há PDF compilado ao lado deste arquivo. Compile-o com sua ferramenta LaTeX e tente novamente. Caminhos procurados:',
  searched: 'Caminhos procurados',
  retry: 'Tentar novamente',
} satisfies Record<TexPreviewKey, string>
