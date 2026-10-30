/* Command Post deployment settings.
   clientId: the OAuth client ID of the "Command Post" application item registered in Botetourt County ArcGIS Online.
   serviceUrl: optional. Leave blank and the app finds the BOCO_Command_Post feature service by name. */
window.CP_CONFIG = {
  portal: 'https://botetourt.maps.arcgis.com',
  clientId: 'n2nFWHs6Eb9dg9Cs',
  serviceName: 'BOCO_Command_Post',
  serviceUrl: ''
};
// System name shown on every app, sign-in page and hub page.
window.CP_BRAND = { name: 'BEACON', long: 'Botetourt Emergency Activity, Coordination & Operations Network' };
