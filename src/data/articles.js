export const articles = [
  {
    slug: 'build-a-learning-map',
    title: '把零散教程整理成一张可执行的学习地图',
    summary: '从目标、证据和复盘三个维度整理技术资料，让收藏夹真正参与每周学习。',
    date: '2026-08-13',
    author: 'code-hive 编辑部',
    cover: '/articles/learning-map-cover.svg',
    markdownPath: 'src/content/articles/build-a-learning-map.md',
  },
  {
    slug: 'read-open-source-projects',
    title: '第一次读开源项目，从一条真实路径开始',
    summary: '避开从目录第一行硬读到最后一行的困境，用一个用户动作串起入口、状态和输出。',
    date: '2026-08-06',
    author: 'code-hive 编辑部',
    cover: '/articles/open-source-cover.svg',
    markdownPath: 'src/content/articles/read-open-source-projects.md',
  },
]

export function articleSlugFromHash(hash) {
  const match = /^#\/articles\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(hash)
  return match ? match[1] : null
}

export function findArticleBySlug(slug) {
  return articles.find((article) => article.slug === slug) ?? null
}
