function InlineMarkdown({ text }) {
  const parts = text.split(/(!\[[^\]]+\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|`[^`]+`)/g)
  return parts.map((part, index) => {
    const image = /^!\[([^\]]+)\]\(([^)]+)\)$/.exec(part)
    if (image) return <img className="article-inline-image" src={image[2]} alt={image[1]} key={`${part}-${index}`} />
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/.exec(part)
    if (link) return <a href={link[2]} target="_blank" rel="noreferrer" key={`${part}-${index}`}>{link[1]}</a>
    const code = /^`([^`]+)`$/.exec(part)
    if (code) return <code key={`${part}-${index}`}>{code[1]}</code>
    return part
  })
}

export function MarkdownArticle({ source }) {
  const blocks = []
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  let paragraph = []
  let list = []
  let code = []
  let language = ''
  let inCode = false

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
    paragraph = []
  }
  const flushList = () => {
    if (list.length) blocks.push({ type: 'list', items: list })
    list = []
  }

  lines.forEach((line) => {
    if (line.startsWith('```')) {
      flushParagraph()
      flushList()
      if (inCode) {
        blocks.push({ type: 'code', text: code.join('\n'), language })
        code = []
        language = ''
      } else {
        language = line.slice(3).trim()
      }
      inCode = !inCode
      return
    }
    if (inCode) {
      code.push(line)
      return
    }
    if (!line.trim()) {
      flushParagraph()
      flushList()
      return
    }
    if (line.startsWith('## ')) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'heading', text: line.slice(3) })
      return
    }
    if (/^[-*] /.test(line)) {
      flushParagraph()
      list.push(line.slice(2))
      return
    }
    if (line.startsWith('> ')) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'quote', text: line.slice(2) })
      return
    }
    if (/^!\[[^\]]+\]\([^)]+\)$/.test(line)) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'image', text: line })
      return
    }
    paragraph.push(line)
  })
  flushParagraph()
  flushList()

  return (
    <div className="markdown-body">
      {blocks.map((block, index) => {
        if (block.type === 'heading') return <h2 key={index}>{block.text}</h2>
        if (block.type === 'quote') return <blockquote key={index}><InlineMarkdown text={block.text} /></blockquote>
        if (block.type === 'code') return <pre key={index} data-language={block.language}><code>{block.text}</code></pre>
        if (block.type === 'list') return <ul key={index}>{block.items.map((item) => <li key={item}><InlineMarkdown text={item} /></li>)}</ul>
        if (block.type === 'image') return <div className="article-figure" key={index}><InlineMarkdown text={block.text} /></div>
        return <p key={index}><InlineMarkdown text={block.text} /></p>
      })}
    </div>
  )
}
