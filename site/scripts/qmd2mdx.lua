-- Pandoc filter: Quarto chapter (.qmd) -> MDX for the Astro/Starlight site.
-- Run by qmd2mdx.py with -f markdown-markdown_in_html_blocks-auto_identifiers -t gfm.
-- Pass 1 reshapes blocks (callouts, HTML tables, shortcodes); pass 2 makes text and inline HTML MDX-safe.

local VOID = { "br", "hr", "img", "col", "source", "input", "meta", "link", "area", "base", "embed", "param", "track", "wbr" }
-- Quarto callout -> Starlight aside, keeping Quarto's own default title text
local CALLOUT = { note = "note", tip = "tip", important = "danger", warning = "caution", caution = "caution" }
local CALLOUT_TITLE = { note = "Note", tip = "Tip", important = "Important", warning = "Warning", caution = "Caution" }

-- colored text in the chapters (red placeholders, blue/navy emphasis) keeps its meaning as a class
local function color_class(style)
  local c = (style or ""):lower():match("color%s*:%s*([#%w]+)")
  if not c then return nil end
  if c == "red" or c:match("^#[cdef]") then return "c-red" end
  return "c-blue"
end

-- HTML written by hand in the chapters, made valid JSX: comments and <style> dropped, void tags self-closed
local function jsx_html(s)
  s = s:gsub("<!%-%-.-%-%->", "")
  s = s:gsub('(<span)%s+style="([^"]*)"', function(tag, style)
    local cls = color_class(style)
    return cls and (tag .. ' class="' .. cls .. '"') or tag
  end)
  s = s:gsub("<style.-</style>", "")
  for _, tag in ipairs(VOID) do
    s = s:gsub("<(" .. tag .. ")(%f[%s/>][^>]-)%s*/?>", function(t, attrs) return "<" .. t .. attrs .. " />" end)
    s = s:gsub("<(" .. tag:upper() .. ")(%f[%s/>][^>]-)%s*/?>", function(t, attrs) return "<" .. t:lower() .. attrs .. " />" end)
  end
  s = s:gsub("</(%a+)%s*>", function(t) for _, v in ipairs(VOID) do if t:lower() == v then return "" end end end)
  -- attribute values must be quoted in MDX (width=560 -> width="560"), only inside tags
  s = s:gsub("(<%a[^<>]*>)", function(tag)
    return (tag:gsub("(%s[%w%-:]+)=([^%s\"'>/]+)", '%1="%2"'))
  end)
  return s
end

local styles_seen = "" -- <style> blocks so far in the chapter

local function is_shortcode(blk)
  local t = pandoc.utils.stringify(blk)
  return t:match("^%s*{{<.->}}%s*$") ~= nil
end

local pass1 = {
  Div = function(el)
    for _, c in ipairs(el.classes) do
      local kind = c:match("^callout%-(%a+)$")
      if kind and CALLOUT[kind] then
        local title = el.attributes["title"] or CALLOUT_TITLE[kind] or ""
        local content = el.content
        if #content > 0 and content[1].t == "Header" then
          title = pandoc.utils.stringify(content[1].content)
          content = pandoc.List({ table.unpack(content, 2) })
        end
        local out = pandoc.List({ pandoc.RawBlock("markdown", ":::" .. (CALLOUT[kind] or "note") .. (title ~= "" and ("[" .. title .. "]") or "")) })
        out:extend(content)
        out:insert(pandoc.RawBlock("markdown", ":::"))
        return out
      end
    end
    return el.content -- other divs (layout only) are unwrapped
  end,
  Para = function(el) if is_shortcode(el) then return {} end end,
  Plain = function(el) if is_shortcode(el) then return {} end end,
  RawBlock = function(el)
    if el.format == "tex" or el.format == "latex" then
      local body = el.text:gsub("^%s*\\begin{equation%*?}", ""):gsub("\\end{equation%*?}%s*$", "")
      return pandoc.RawBlock("markdown", "$$\n" .. body:gsub("^%s+", ""):gsub("%s+$", "") .. "\n$$")
    end
    if el.format ~= "html" then return el end
    if el.text:match("^%s*<style") then styles_seen = styles_seen .. el.text end
    if el.text:match("<table") then
      -- hand-built HTML tables become ordinary tables (the site styles them)
      -- keep the meaning of the table generator's colors: shaded cells (a background) and accent text
      local meaning = {}
      for cls, rule in (styles_seen .. el.text):gmatch("%.(tg%-[%w]+)%s*(%b{})") do
        if rule:match("background%-color") then meaning[cls] = "shade"
        elseif rule:match("[^%-]color%s*:") then meaning[cls] = "accent" end
      end
      local html = el.text:gsub("<style.-</style>", ""):gsub('class="(tg%-[%w]+)"', function(c)
        return meaning[c] and ('class="' .. meaning[c] .. '"') or ""
      end)
      local doc = pandoc.read(html, "html")
      local KEEP = { shade = true, accent = true }
      local function plain_rows(rows)
        for _, row in ipairs(rows) do
          row.attr = pandoc.Attr()
          for _, cell in ipairs(row.cells) do
            cell.attr = pandoc.Attr("", cell.attr.classes:filter(function(c) return KEEP[c] end))
          end
        end
      end
      return doc.blocks:walk({
        Table = function(t)
          t.attr = pandoc.Attr()
          for i, spec in ipairs(t.colspecs) do t.colspecs[i] = { spec[1], pandoc.ColWidthDefault } end
          plain_rows(t.head.rows)
          for _, body in ipairs(t.bodies) do plain_rows(body.head); plain_rows(body.body) end
          plain_rows(t.foot.rows)
          return t
        end,
        -- Quarto read markdown inside HTML cells, so SpO~2~ and 10^9^ were sub/superscripts there too
        Str = function(el)
          local out, rest = pandoc.List(), el.text
          while true do
            local a, b, pre, mark, inner = rest:find("^(.-%w)([~^])([^~^%s]+)%2")
            if not a then break end
            out:insert(pandoc.Str(pre))
            out:insert(mark == "~" and pandoc.Subscript({ pandoc.Str(inner) }) or pandoc.Superscript({ pandoc.Str(inner) }))
            rest = rest:sub(b + 1)
          end
          if #out == 0 then return nil end
          if rest ~= "" then out:insert(pandoc.Str(rest)) end
          return out
        end,
      })
    end
    local s = jsx_html(el.text)
    if s:match("^%s*$") then return {} end
    return pandoc.RawBlock("markdown", s)
  end,
  Figure = function(el)
    -- an image with a caption (Quarto shows the caption under it)
    local img
    el.content:walk({ Image = function(i) img = i end })
    if not img then return nil end
    local blocks = pandoc.List({ pandoc.RawBlock("markdown", "<figure>"), pandoc.Plain({ img }) })
    local cap = pandoc.utils.stringify(el.caption.long)
    if cap ~= "" then
      blocks:insert(pandoc.RawBlock("markdown", "<figcaption>"))
      blocks:extend(el.caption.long)
      blocks:insert(pandoc.RawBlock("markdown", "</figcaption>"))
    end
    blocks:insert(pandoc.RawBlock("markdown", "</figure>"))
    return blocks
  end,
  CodeBlock = function(el)
    for _, c in ipairs(el.classes) do
      if c:match("mermaid") then return pandoc.CodeBlock(el.text, pandoc.Attr("", { "mermaid" })) end
    end
  end,
}

local function escape_str(s)
  -- MDX reads { } as code and < as a tag; HTML entities are right both in MDX text and in HTML tables
  local ENT = { ["{"] = "&#123;", ["}"] = "&#125;", ["<"] = "&lt;", [">"] = "&gt;" }
  local out, buf = pandoc.List(), ""
  for ch in s:gmatch(utf8.charpattern) do
    if ENT[ch] then
      if buf ~= "" then out:insert(pandoc.Str(buf)); buf = "" end
      out:insert(pandoc.RawInline("html", ENT[ch]))
    else
      buf = buf .. ch
    end
  end
  if buf ~= "" then out:insert(pandoc.Str(buf)) end
  return out
end

-- After a hard line break, a line starting "- ", "+ ", "* " or "1. " is text in Quarto but a list item in MDX
local function escape_line_starts(inlines)
  for i = 2, #inlines do
    local prev, cur = inlines[i - 1], inlines[i]
    if (prev.t == "LineBreak" or prev.t == "SoftBreak") and cur.t == "Str" then
      if cur.text:match("^[-+*]$") or cur.text:match("^#+$") then
        inlines[i] = pandoc.RawInline("markdown", "\\" .. cur.text)
      elseif cur.text:match("^%d+[.)]$") then
        inlines[i] = pandoc.RawInline("markdown", cur.text:sub(1, -2) .. "\\" .. cur.text:sub(-1)) -- 1\.
      end
    end
  end
  return inlines
end

local function tex_to_math(text)
  local body = text:gsub("^%s*\\begin{equation%*?}", ""):gsub("\\end{equation%*?}%s*$", "")
  return body:gsub("^%s+", ""):gsub("%s+$", "")
end

local pass2 = {
  Inlines = escape_line_starts,
  Str = function(el)
    if el.text:find("[{}<>]") then return escape_str(el.text) end
  end,
  Header = function(el)
    if el.identifier ~= "" then
      el.content:insert(pandoc.RawInline("markdown", " {/*#" .. el.identifier .. "*/}"))
      el.identifier = ""
    end
    return el
  end,
  Image = function(el)
    -- plain <img> with the original relative path: pages all sit at the site root, wherever the site is hosted
    local alt = pandoc.utils.stringify(el.caption):gsub('"', "&quot;")
    return pandoc.RawInline("markdown", '<img src="' .. el.src:gsub(" ", "%%20") .. '" alt="' .. alt .. '" loading="lazy" />')
  end,
  RawInline = function(el)
    if el.format == "html" then return pandoc.RawInline("markdown", jsx_html(el.text)) end
    if (el.format == "tex" or el.format == "latex") and el.text:match("\\begin{equation") then
      -- an equation inside a list item: shown as display math on its own line
      return pandoc.RawInline("markdown", "\n\n$$\n" .. tex_to_math(el.text) .. "\n$$\n\n")
    end
  end,
  Span = function(el)
    local cls = color_class(el.attributes["style"])
    if cls then
      local out = pandoc.List({ pandoc.RawInline("markdown", '<span class="' .. cls .. '">') })
      out:extend(el.content)
      out:insert(pandoc.RawInline("markdown", "</span>"))
      return out
    end
    if el.classes:includes("underline") then
      local out = pandoc.List({ pandoc.RawInline("markdown", "<u>") })
      out:extend(el.content)
      out:insert(pandoc.RawInline("markdown", "</u>"))
      return out
    end
    return el.content
  end,
  Link = function(el)
    -- a link whose text is its address: written out in full (MDX has no <https://...> shorthand)
    local text = pandoc.utils.stringify(el.content)
    if text == el.target or "mailto:" .. text == el.target then
      return pandoc.RawInline("markdown", "[" .. text:gsub("([%[%]])", "\\%1") .. "](" .. el.target:gsub(" ", "%%20") .. ")")
    end
  end,
  Math = function(el)
    -- standard $...$ / $$...$$ for remark-math (pandoc's GitHub writer uses $`...`$)
    if el.mathtype == "DisplayMath" then return pandoc.RawInline("markdown", "\n$$\n" .. el.text .. "\n$$\n") end
    return pandoc.RawInline("markdown", "$" .. el.text .. "$")
  end,
  Cite = function(el)
    -- @sec-... cross-references stay as text; the site turns them into links
    return pandoc.RawInline("markdown", pandoc.utils.stringify(el.content))
  end,
}

return { pass1, pass2 }
