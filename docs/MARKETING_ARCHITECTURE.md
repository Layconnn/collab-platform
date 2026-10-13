# Commons Public-Site Architecture

The current public experience is the landing page (`/`) plus sign-in (`/login`)
and registration (`/register`). The landing page may link to its own product and
workflow sections. These are the only live public destinations; navigation must
not imply that unbuilt pages exist.

Future pages can be added when there is substantive content and a real audience
need: a feature overview explaining supported workflows, an about page for the
project's purpose, a how-it-works guide grounded in the application, and
documentation or updates when those resources are maintained. Each page should
share the public navigation, footer, editorial tokens and accessible motion
conventions, while remaining a server component unless its own interaction
requires a small client boundary. Pricing should wait for an actual pricing
model. Do not publish placeholder routes or unsupported capability claims.
