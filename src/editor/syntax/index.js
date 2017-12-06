import { validEmoji } from '../emojis'
import {
  findOutMostParagraph, findNearestParagraph, isFirstChildElement,
  isOnlyChildElement, insertAfter, operateClassName
} from '../utils/domManipulate'
import { isEven, loadImage, getUniqueId, isConflicted } from '../utils'
import {
  LOWERCASE_TAGS,
  CLASS_OR_ID,
  markedSymbol
} from '../config'

/**
 * RegExp constants
 */
// **attention please**  the order in fragments is important.
// because INLINE_CHOP_REG also use parts of it's fragment.

const fragments = [
  '^\\*{3,}|^\\-{3,}|^\\_{3,}', // hr
  '^`{3,}[^`]*', // code fense
  '^#{1,6}', // Header
  '\\\\*(\\*{2}|_{2})(?:[^\\s]|[^\\s].*?[^\\s])\\\\*\\1', // strong
  '\\\\*(\\*{1}|_{1})(?:[^\\s]|[^\\s].*?[^\\s])\\\\*\\2', // em
  '\\\\*(`{1,3})([^`]+?|.{2,})\\\\*\\3', // inline code
  '\\\\*\\!\\[.*?\\\\*\\]\\(.*?\\\\*\\)', // image
  '\\\\*\\[.+?\\\\*\\]\\(.*?\\\\*\\)', // link
  '\\\\*\\[\\]\\(.*?\\\\*\\)', // no text link
  '\\\\*:[^:\\\\]+?:', // emoji
  '\\\\*~{2}[^~]+\\\\*~{2}', // line through
  'https?://[^\\s]+(?=\\s|$)', // auto link
  `\\\\+(?=[${markedSymbol.join()}]{1})` // eslint-disable-line no-useless-escape
]

const CHOP_REG = new RegExp(fragments.join('|'), 'g') // eslint-disable-line no-useless-escape
const INLINE_CHOP_REG = new RegExp(fragments.slice(3).join('|'), 'g') // eslint-disable-line no-useless-escape

const HEAD_REG_G = /^(#{1,6})/g
const HEAD_REG = /^#{1,6}/

const STRONG_REG_G = /^(\\*)(\*{2}|_{2})([^\s]|[^\s].*?[^\s])(\\*)(\2)/g
const STRONG_REG = /^(?:\\*)(\*{2}|_{2})(?:[^\s]|[^\s].*?[^\s])(?:\\*)\1/
const EM_REG_G = /^(\\*)(\*{1}|_{1})([^\s]|[^\s].*?[^\s])(\\*)(\2)/g
const EM_REG = /^(?:\\*)(\*{1}|_{1})(?:[^\s]|[^\s].*?[^\s])(?:\\*)\1/

const INLINE_CODE_REG_G = /^(\\*)(`{1,3})([^`]+?|.{2,})(\\*)(\2)/g
const INLINE_CODE_REG = /^(?:\\*)(`{1,3})([^`]+?|.{2,})(?:\\*)(\1)/
// eslint has bug ? need ignore
const LINK_REG_G = /^(\\*)(\[)(.+?)(\\*)(\]\()(.*?)(\\*)(\))/g // eslint-disable-line no-useless-escape
const LINK_REG = /^\\*\[.+?\\*\]\(.*?\\*\)/ // eslint-disable-line no-useless-escape
const IMAGE_REG_G = /^(\\*)(\!\[)(.*?)(\\*)(\]\()(.*?)(\\*)(\))/g // eslint-disable-line no-useless-escape
const IMAGE_REG = /^\\*\!\[.*?\\*\]\(.*?\\*\)/ // eslint-disable-line no-useless-escape
const NO_TEXT_LINK_G = /^(\\*)(\[\]\()(.*?)(\\*)(\))/g
const NO_TEXT_LINK = /^\\*\[\]\(.*?\\*\)/
const EMOJI_REG_G = /^(:)([^:]+?)(:)/g
const EMOJI_REG = /^:[^:]+?:/
const LINE_THROUGH_REG_G = /^(\\*)(~{2})([^~]+?)(\\*)(~{2})/g
const LINE_THROUGH_REG = /^\\*~{2}[^~]+?\\*~{2}/
const AUTO_LINK_G = /^(https?:\/\/[^\\s]+)(?=\s|$)/g
const AUTO_LINK = /^https?:\/\/[^\s]+(?=\s|$)/
const HR_REG_G = /(^\*{3,}|^-{3,}|^_{3,})/g
const HR_REG = /^\*{3,}|^-{3,}|^_{3,}/
const CODE_BLOCK_G = /(^`{3,})([^`]*)/g
const CODE_BLOCK = /^`{3,}[^`]*/
const BACKLASH_REG_G = new RegExp('^(\\\\+)', 'g')
const BACKLASH_REG = new RegExp('^\\\\+', 'i')

// const SIMPLE_LINK_G = /(<)([^<>]+?)(>)/g
// const SIMPLE_LINK = /<[^<>]+?>/g
const LINE_BREAK_BLOCK_REG = /^(?:`{3,}([^`]*))|^\*{3,}|^-{3,}|^_{3,}/ // eslint-disable-line no-useless-escape
const INLINE_BLOCK_REG = /^(?:[*+-]\s(\[\s\]\s)?|\d+\.\s|(#{1,6})[^#]+|>.+)/
const CHOP_HEADER_REG = /^([*+-]\s(?:\[\s\]\s)?|>\s*|\d+\.\s)/

/**
 * [backlash => html]
 * examples:
 * `\` => `<a href="#" class="${className}">\</a>`
 * `\\` => `<a href="#" class="${className}">\</a>\`
 */
const backlash2html = (backlashes, className) => {
  const chunks = backlashes.split('')
  const len = chunks.length
  let i
  let result = ''
  for (i = 0; i < len; i++) {
    if (isEven(i)) {
      result += `<a href="#" class="${className}">${chunks[i]}<a>`
    } else {
      result += `<a href="#" class="${CLASS_OR_ID['AG_BACKLASH']}">${chunks[i]}</a>`
    }
  }
  return `${result}<a class="${CLASS_OR_ID['AG_BUG']}"></a>` // the extral a tag for fix the bug.
}

const chunk2html = (ids, { chunk, index, lastIndex }, { start, end } = {}, outerClsssName) => {
  // if no positionState provided, no conflict.
  const isConflicted = start !== undefined && end !== undefined
    ? conflict([index, lastIndex], [start, end])
    : false
  const className = outerClsssName || (isConflicted ? CLASS_OR_ID['AG_GRAY'] : CLASS_OR_ID['AG_HIDE'])

  // handle head mark symble
  if (HEAD_REG.test(chunk)) {
    return chunk.replace(HEAD_REG_G, (match, p1) => {
      return `<a href="#" class="${className}">${p1}</a>`
    })
  }
  // handle strong
  if (STRONG_REG.test(chunk)) {
    return chunk.replace(STRONG_REG_G, (match, p1, p2, p3, p4, p5) => {
      console.log(`p1: ${p1}, p2: ${p2}, p3: ${p3}, p4: ${p4}, p5: ${p5}`)
      if (isEven(p1.length) && isEven(p4.length)) {
        return (
          backlash2html(p1, className) +
          `<a href="#" class="${className}">${p2}</a>` +
          `<strong>${markedText2Html(ids, p3, undefined, className, 'inline')}${backlash2html(p4, className)}</strong>` +
          `<a href="#" class="${className}">${p5}</a>`
        )
      } else if (!isEven(p4.length)) {
        return (
          `${backlash2html(p1, className)}*` +
          `<a href="#" class="${className}">*</a>` +
          `<em>${markedText2Html(ids, p3, undefined, className, 'inline')}${backlash2html(p4, className)}*</em>` +
          `<a href="#" class="${className}">*</a>`
        )
      } else if (!isEven(p1.length) && isEven(p4.length)) {
        return (
          `${backlash2html(p1, className)}*` +
          `<a href="#" class="${className}">*</a>` +
          `<em>${markedText2Html(ids, p3, undefined, className, 'inline')}${backlash2html(p4, className)}</em>` +
          `<a href="#" class="${className}">*</a>*`
        )
      }
    })
  }

  // handle emphasize
  if (EM_REG.test(chunk)) {
    return chunk.replace(EM_REG_G, (match, p1, p2, p3, p4, p5) => {
      if (isEven(p1.length) && isEven(p4.length)) {
        return (
          backlash2html(p1, className) +
          `<a href="#" class="${className}">${p2}</a>` +
          `<em>${markedText2Html(ids, p3, undefined, className, 'inline')}${backlash2html(p4, className)}</em>` +
          `<a href="#" class="${className}">${p5}</a>`
        )
      } else {
        return (
          `${backlash2html(p1, className)}${p2}` +
          `${markedText2Html(ids, p3, undefined, className, 'inline')}` +
          `${backlash2html(p4, className)}${p5}`
        )
      }
    })
  }
  // handle inline code: markdown text: `code`
  // => `
  //    <a href="#" class="ag-gray|ag-hide">`</a>
  //    <code>code</code>
  //    <a href="#" class="ag-gray|ag-hide">`<a>
  //  `
  //  also need to handle more than one `. ex: ``code`another``
  if (INLINE_CODE_REG.test(chunk)) {
    return chunk.replace(INLINE_CODE_REG_G, (match, p1, p2, p3, p4, p5) => {
      if (isEven(p1.length) && isEven(p4.length)) {
        return (
          backlash2html(p1, className) +
          `<a href="#" class="${className}">${p2}</a>` +
          `<code>${p3}${backlash2html(p4, className)}</code>` +
          `<a href="#" class="${className}">${p5}</a>`
        )
      } else {
        return (
          `${backlash2html(p1, className)}${p2}` +
          `${p3}` +
          `${backlash2html(p4, className)}${p5}`
        )
      }
    })
  }
  // handler no text link: markdown text: `[](www.baidu.com)`
  if (NO_TEXT_LINK.test(chunk)) {
    return chunk.replace(NO_TEXT_LINK_G, (match, p1, p2, p3, p4, p5) => {
      if (isEven(p1.length) && isEven(p4.length)) {
        return (
          backlash2html(p1, className) +
          `<a href="#" class="${CLASS_OR_ID['AG_GRAY']}">${p2}</a>` +
          `<span href="${p3 + p4}" role="link">${p3}${backlash2html(p4, className)}</span>` +
          `<a href="#" class="${CLASS_OR_ID['AG_GRAY']}">${p5}</a>`
        )
      } else {
        return (
          backlash2html(p1, className) +
          p2 +
          p3 +
          backlash2html(p4, className) +
          p5
        )
      }
    })
  }

  // handle link: markdown text: [Aganippe](https://github.com/Jocs/aganippe/commits/master)
  //  => html bellow
  //  `
  //  <a href="#" class="ag-gray|ag-hide">[</a>
  //  <span data-href="https://github.com/Jocs/aganippe/commits/master" role="link">Aganippe</span>
  //  <a href="#" class="ag-gray|ag-hide">]</a>
  //  <a href="#" class="ag-gray|ag-hide">(</a>
  //  <a href="#" class="ag-gray|ag-hide">https://github.com/Jocs/aganippe/commits/master</a>
  //  <a href="#" class="ag-gray|ag-hide">)</a>
  //
  //  `
  if (LINK_REG.test(chunk)) {
    return chunk.replace(LINK_REG_G, (match, p1, p2, p3, p4, p5, p6, p7, p8) => {
      const linkClassName = className === CLASS_OR_ID['AG_HIDE'] ? className : CLASS_OR_ID['AG_LINK_IN_BRACKET']
      // use span tag to simulate a tag. because can not nest a tag in a tag.
      if (isEven(p1.length) && isEven(p4.length) && isEven(p7.length)) {
        return (
          backlash2html(p1, className) +
          `<a href="#" class="${className}">${p2}</a>` +
          `<span data-href="${p6 + p7}" role="link">` +
          `${markedText2Html(ids, p3, undefined, className, 'inline')}` +
          `${backlash2html(p4, className)}` +
          `</span>` +
          `<a href="#" class="${className}">${p5}</a>` +
          `<span href="#" class="${linkClassName}">${p6}${backlash2html(p7, className)}</span>` +
          `<a href="#" class="${className}">${p8}</a>`
        )
      } else {
        return (
          backlash2html(p1, className) +
          p2 +
          `${markedText2Html(ids, p3, undefined, className, 'inline')}` +
          backlash2html(p4, className) +
          p5 +
          p6 +
          backlash2html(p7, className) +
          p8
        )
      }
    })
  }
  if (IMAGE_REG.test(chunk)) {
    // `<img src="${p6 + encodeURI(p7)}" alt="${p3 + encodeURI(p4)}">`
    return chunk.replace(IMAGE_REG_G, (match, p1, p2, p3, p4, p5, p6, p7, p8) => {
      const imageClassName = CLASS_OR_ID['AG_IMAGE_MARKED_TEXT']

      if (isEven(p1.length) && isEven(p4.length) && isEven(p7.length)) {
        const imgId = getUniqueId(ids)
        loadImage(p6 + encodeURI(p7))
          .then(url => {
            const imageWrapper = document.querySelector(`#${imgId}`)
            const img = document.createElement('img')
            img.src = url
            img.alt = p3 + encodeURI(p4)
            if (imageWrapper) {
              insertAfter(img, imageWrapper)
              operateClassName(imageWrapper, 'add', className)
            }
          })
          .catch(() => {
            const imageWrapper = document.querySelector(`#${imgId}`)
            if (imageWrapper) {
              operateClassName(imageWrapper, 'add', CLASS_OR_ID['AG_IMAGE_FAIL'])
            }
          })
        return (
          backlash2html(p1, className) +
          `<a href="#" class="${imageClassName}" id="${imgId}">` +
          p2 + p3 + p4 + p5 + p6 + p7 + p8 +
          `</a>`
        )
      } else {
        return (
          backlash2html(p1, className) +
          p2 +
          `${markedText2Html(p3, undefined, className, 'inline')}` +
          backlash2html(p4, className) +
          p5 +
          p6 +
          backlash2html(p7, className) +
          p8
        )
      }
    })
  }
  // handle emoji
  if (EMOJI_REG.test(chunk)) {
    return chunk.replace(EMOJI_REG_G, (match, p1, p2, p3) => {
      const validation = validEmoji(p2)
      if (validation) {
        return (
          `<a href="#" class="${className}">${p1}</a>` +
          `<a href="#" class="${className} ${CLASS_OR_ID['AG_EMOJI_MARKED_TEXT']}" data-emoji="${validation.emoji}">${p2}</a>` +
          `<a href="#" class="${className}">${p3}</a>`
        )
      } else {
        return (
          `<a href="#" class="${CLASS_OR_ID['AG_WARN']}">${p1}</a>` +
          `<a href="#" class="${CLASS_OR_ID['AG_WARN']} ${CLASS_OR_ID['AG_EMOJI_MARKED_TEXT']}">${p2}</a>` +
          `<a href="#" class="${CLASS_OR_ID['AG_WARN']}">${p3}</a>`
        )
      }
    })
  }
  // del or s element
  if (LINE_THROUGH_REG.test(chunk)) {
    return chunk.replace(LINE_THROUGH_REG_G, (match, p1, p2, p3, p4, p5) => {
      console.log(p1, p2, p3, p4, p5)
      if (isEven(p1.length) && isEven(p4.length)) {
        return (
          backlash2html(p1, className) +
          `<a href="#" class="${className}">${p2}</a>` +
          `<del>${markedText2Html(p3, undefined, className, 'inline')}${backlash2html(p4, className)}</del>` +
          `<a href="#" class="${className}">${p5}</a>`
        )
      } else {
        return (
          backlash2html(p1, className) +
          p2 +
          p3 +
          backlash2html(p4, className) +
          p5
        )
      }
    })
  }

  if (AUTO_LINK.test(chunk)) {
    return chunk.replace(AUTO_LINK_G, (match, p1) => {
      return (
        `<a href="${p1}">${p1}</a>`
      )
    })
  }
  // hr chunk
  if (HR_REG.test(chunk)) {
    return chunk.replace(HR_REG_G, (match, p1) => {
      return `<a href="#" class="${CLASS_OR_ID['AG_GRAY']}">${p1}</a>`
    })
  }

  if (CODE_BLOCK.test(chunk)) {
    return chunk.replace(CODE_BLOCK_G, (match, p1, p2) => {
      return (
        `<a href="#" class="${CLASS_OR_ID['AG_GRAY']}">${p1}</a>` +
        `<a href="#" class="${CLASS_OR_ID['AG_LANGUAGE']}">${p2}</a>`
      )
    })
  }

  if (BACKLASH_REG.test(chunk)) {
    return chunk.replace(BACKLASH_REG_G, (match, p1) => {
      return backlash2html(p1, className)
    })
  }

  // handle picture
  // TODO
  // handle auto link: markdown text: `<this is a auto link>`
  return chunk
}

const getMarkedChunks = (markedText, type) => {
  const chunks = []
  const REG_EXP = type && type === 'inline' ? INLINE_CHOP_REG : CHOP_REG
  let match

  do {
    match = REG_EXP.exec(markedText)
    if (match) {
      chunks.push({
        index: match.index,
        chunk: match[0],
        lastIndex: REG_EXP.lastIndex
      })
    }
  } while (match)
  console.log(chunks)
  return chunks
}

/**
 * translate marked text to html
 * ex: `###hello **world|**` =>
 * `
 *   <a href="#" class="ag-hide">###</a>hello <a href="#" class="ag-gray">**</a>world<a href="#" class="ag-gray">
 * `
 * `|` is the cursor position in marked text
 */
export const markedText2Html = (ids, markedText, positionState, className, type) => {
  const chunks = getMarkedChunks(markedText, type)
  let result = markedText

  if (chunks.length > 0) {
    const chunksWithHtml = chunks.map(c => {
      const html = chunk2html(ids, c, positionState, className)
      return Object.assign(c, { html })
    })
    // does this will have bug ?
    chunksWithHtml.forEach(c => {
      result = result.replace(c.chunk, c.html)
    })
  }
  return result
}

/**
 * check markedTextUpdate
 */

export const checkMarkedTextUpdate = (html, markedText, { start, end }) => {
  if (/ag-gray/.test(html)) return true

  const chunks = getMarkedChunks(markedText)
  const len = chunks.length
  const textLen = markedText.length
  let i

  for (i = 0; i < len; i++) {
    const { index, lastIndex } = chunks[i]
    if (conflict([Math.max(0, index - 1), Math.min(textLen, lastIndex + 1)], [start, end])) {
      return true
    }
  }

  return false
}

export const checkBackspaceCase = (startNode, selection) => {
  const nearestParagraph = findNearestParagraph(startNode)
  const outMostParagraph = findOutMostParagraph(startNode)
  const parentNode = nearestParagraph.parentNode
  const parTagName = parentNode.tagName.toLowerCase()
  const { left: outLeft, right: outRight } = selection.getCaretOffsets(outMostParagraph)
  const { left: inLeft } = selection.getCaretOffsets(nearestParagraph)

  if (parTagName === LOWERCASE_TAGS.li && inLeft === 0) {
    if (isOnlyChildElement(parentNode)) {
      return { type: 'LI', info: 'REPLACEMENT' }
    } else if (isFirstChildElement(parentNode)) {
      return { type: 'LI', info: 'REMOVE_INSERT_BEFORE' }
    } else {
      return { type: 'LI', info: 'INSERT_PRE_LIST' }
    }
  }
  if (parTagName === LOWERCASE_TAGS.blockquote && inLeft === 0) {
    if (isOnlyChildElement(nearestParagraph)) {
      return { type: 'BLOCKQUOTE', info: 'REPLACEMENT' }
    } else if (isFirstChildElement(nearestParagraph)) {
      return { type: 'BLOCKQUOTE', info: 'INSERT_BEFORE' }
    }
  }
  if (!outMostParagraph.previousElementSibling && outLeft === 0 && outRight === 0) {
    return { type: 'STOP' }
  }
}

export const checkLineBreakUpdate = text => {
  const token = text.match(LINE_BREAK_BLOCK_REG)
  if (!token) return false
  const match = token[0]

  switch (true) {
    case /^`{3,}.*/.test(match):
      return { type: 'pre', info: token[1].trim() }
    case HR_REG.test(match):
      return { type: 'hr' }
    default:
      return false
  }
}

export const chopHeader = markedText => {
  return markedText.replace(CHOP_HEADER_REG, '')
}
