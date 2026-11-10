# fedora-riscv.github.io

Source of the Fedora-V Force community site, served at <https://blog.fedoravforce.com/>.
Built with Hugo (version pinned in `.github/workflows/hugo.yaml`) and the in-repo theme `themes/fvf`.
Pushing to `main` deploys to GitHub Pages.

## Run locally

```sh
git clone --recurse-submodules https://github.com/fedora-riscv/fedora-riscv.github.io
cd fedora-riscv.github.io
hugo server
```

## Content

- `content/fedora-riscv-devel-docs/` is a submodule (`fedora-riscv/Fedora_riscv_devel_docs`). Edit the docs there.
  Titles, order, summaries and series for those pages live in `data/docs.yaml`.
- New sections (for example `content/tutorials/` or `content/news/`) show up on the home page and in
  "All posts" as soon as they contain a page. Give each section an `_index.md` with a `title`.
- Comments use [giscus](https://giscus.app) on `fedora-riscv/Discussions`, category "Blog Comments"
  (settings in `config/_default/hugo.toml`). Set `comments: false` in a page's front matter to hide them.
