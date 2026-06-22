# RMC NICU Handbook — Project Memory

## Project Overview

This is a **Quarto book** project titled *KP Riverside Neonatal ICU Manual*, maintained by Dr. Fu-Sheng Chou (MD PhD). It serves as a clinical reference handbook for the NICU team at KP Riverside.

- **Project file:** `Book.Rproj`
- **Config:** `_quarto.yml` (Quarto book, HTML output, `lumen` theme)
- **Custom styling:** `custom.css`
- **Bibliography:** `references.bib`
- **Output directory:** `_book/`

## Git & GitHub Pages

- **GitHub username:** `fschou-pxt`
- **Remote repo:** `https://github.com/fschou-pxt/RMC-NICU-Manual.git`
- **Branch:** `main` (default)

### Deployment Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-05-25 | Pushed Quarto book to GitHub Pages | Initial GitHub Pages deployment. Removed `embed-resources: true` from `_quarto.yml` for Pages compatibility. |
| 2026-05-25 | Custom CSS added | Word wrapping fix for margin columns via `custom.css`. |
| 2026-05-25 | Pushed updated book to GitHub Pages | Updated `nutrition-fluid.qmd`; rendered and published via `quarto publish gh-pages`. Commit `98f9012` on `gh-pages` branch. |

### How to Publish to GitHub Pages

GitHub Pages is configured to serve from the `gh-pages` branch (or `/docs` folder, confirm in repo Settings > Pages). The standard workflow is:

```bash
# 1. Render the book locally
quarto render

# 2. Publish to GitHub Pages (pushes _book/ to gh-pages branch)
quarto publish gh-pages
```

Or, if using manual git push:

```bash
git add .
git commit -m "Your message"
git push origin main
```

> **Note:** The commit `dedfb09` removed `embed-resources: true` to fix GitHub Pages rendering — do not re-add this option.

## Book Structure

The book is organized into parts:

1. **NICU Operations** — Telemedicine, phone numbers, operations, publications
2. **General Care** — Admission, transfer, discharge, documentation, death workflows
3. **System-Based Protocols** — Respiratory, cardiovascular, nutrition/fluids, GI, renal, ID, endocrine, neurology, heme/onc, genetics
4. **Special Considerations** — Periviability, VLBW, delivery room, surgical
5. **Health Maintenance** — Vaccines
6. **Appendices** — Lluch formulary, dot phrases, references

## Authors (alphabetical)

Michael Chang, Edgar Chernin, Fu-Sheng Chou, Michael Doti, Giulia M. Faison, Kasee L. Houston, Gary Laborada, James A. Washington III, Zoltan Zentay
