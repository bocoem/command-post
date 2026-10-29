# Command Post

Incident management for **Botetourt County Emergency Management**.

One record per incident fills every ICS form (201, 202, 203, 204, 205, 205A, 206, 207, 208, 209, 211, 213, 213RR, 214, 215, 215A, 221) and the Incident Action Plan, and updates the county ArcGIS Online EM layers (Incidents, Incident Facilities, Lifeline Status, Public Message, SitRep, Damage Assessment).

Live app: https://dmurray-botetourt.github.io/command-post/

- Plain HTML/JS, no build step. Hosted on GitHub Pages.
- Sign-in uses ArcGIS Online OAuth 2.0 (PKCE). The client ID in `config.js` is public by design; no secrets are stored here.
- County data lives in ArcGIS Online, not in this repository.
