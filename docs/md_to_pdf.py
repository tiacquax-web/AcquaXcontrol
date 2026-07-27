#!/usr/bin/env python3
import markdown
from weasyprint import HTML
import sys

def md_to_pdf(md_path, pdf_path):
    with open(md_path, 'r', encoding='utf-8') as f:
        md_content = f.read()

    # Convert markdown to HTML
    html_body = markdown.markdown(md_content, extensions=['tables', 'fenced_code', 'toc'])

    # Wrap with styled HTML
    html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  @page {{
    size: A4;
    margin: 2cm 1.8cm;
    @bottom-center {{
      content: "AcquaXControl - Pagina " counter(page) " de " counter(pages);
      font-size: 9px;
      color: #94a3b8;
    }}
  }}
  body {{
    font-family: 'Helvetica', 'Arial', sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #1e293b;
  }}
  h1 {{
    color: #0d9488;
    font-size: 22pt;
    border-bottom: 3px solid #0d9488;
    padding-bottom: 8px;
    margin-top: 0;
  }}
  h2 {{
    color: #0f766e;
    font-size: 16pt;
    margin-top: 24px;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 4px;
  }}
  h3 {{
    color: #115e59;
    font-size: 13pt;
    margin-top: 18px;
  }}
  p {{
    margin-bottom: 10px;
  }}
  ul, ol {{
    margin-bottom: 10px;
    padding-left: 20px;
  }}
  li {{
    margin-bottom: 4px;
  }}
  code {{
    background: #f1f5f9;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 10pt;
  }}
  pre {{
    background: #1e293b;
    color: #e2e8f0;
    padding: 12px;
    border-radius: 8px;
    font-size: 9pt;
    overflow-x: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
  }}
  pre code {{
    background: transparent;
    color: inherit;
    padding: 0;
  }}
  table {{
    border-collapse: collapse;
    width: 100%;
    margin: 12px 0;
    font-size: 10pt;
  }}
  th {{
    background: #0d9488;
    color: white;
    padding: 8px 10px;
    text-align: left;
    font-weight: bold;
  }}
  td {{
    border: 1px solid #e2e8f0;
    padding: 6px 10px;
  }}
  tr:nth-child(even) {{
    background: #f8fafc;
  }}
  blockquote {{
    border-left: 4px solid #0d9488;
    margin: 12px 0;
    padding: 8px 16px;
    background: #f0fdfa;
    color: #115e59;
  }}
  strong {{
    color: #0f172a;
  }}
  hr {{
    border: none;
    border-top: 2px solid #e2e8f0;
    margin: 20px 0;
  }}
</style>
</head>
<body>
{html_body}
</body>
</html>"""

    HTML(string=html).write_pdf(pdf_path)
    print(f"PDF gerado: {pdf_path}")

if __name__ == '__main__':
    md_to_pdf(sys.argv[1], sys.argv[2])
