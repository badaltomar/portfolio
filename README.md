# Badal Tomar, portfolio

Personal portfolio of Badal Tomar, a software engineer based in Gurugram, India.
Plain HTML, CSS and JavaScript. No framework and no build step.

## Run locally

```bash
npm start
```

This serves the folder at http://localhost:5173 (it uses `npx serve`, so Node.js is the only requirement).
You can also open `index.html` directly in a browser.

## Structure

```
index.html            all page content
css/styles.css        styles (design tokens are at the top)
js/main.js            interactions: hero zoom, reveals, nav, project tabs, shooting range
assets/img/           profile photo
assets/docs/          résumé PDF
assets/favicon.svg    site icon
```

## Updating content

Everything is plain text in `index.html`, grouped by section.

| To change | Where |
| --- | --- |
| Résumé | Replace `assets/docs/Badal_Tomar_Resume.pdf`, keeping the same file name |
| Profile photo | Replace `assets/img/badal.webp` |
| Email address | The `mailto:` links and `data-email` attribute in `index.html`, and the JSON-LD block in `<head>` |
| Skills | Add or remove an `<li>` inside a `.chips` list in the scorecard section. Point totals update automatically |
| Certificates | Edit the `.cert` list. Use `is-earned` or `is-progress` on the status badge |
| Add a project | Copy an `<article class="shot">` block, update the text and links, and set its `--i` style value to the next number |
| Colours and fonts | CSS variables at the top of `css/styles.css` |

To use a real screenshot instead of the drawn preview in a project card, put the image in `assets/img/`
and replace the `.mock` element inside that card with an `<img>` tag.

## Deploy

The site is static, so any static host works.

- **Vercel or Netlify:** import the repository, leave the build command empty and deploy. Every push to `main` redeploys.
- **GitHub Pages:** Settings, Pages, deploy from the `main` branch and the root folder.

## Notes

- Respects `prefers-reduced-motion`.
- Layout is tested from small phones up to wide desktop screens.
- Sound effects are off by default and only play after the visitor turns them on.
