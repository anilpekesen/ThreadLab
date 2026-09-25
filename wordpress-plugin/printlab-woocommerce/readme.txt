=== PrintLab – Product Personalizer for WooCommerce ===
Contributors: printlab
Tags: product personalizer, custom product, photo upload, print on demand, woocommerce
Requires at least: 6.4
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.2.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Let customers personalize products with photos and text, and get print-ready files for every order.

== Description ==

PrintLab adds a personalization box to your product pages. Customers place their photos and text into your templates (photo frames, canvases, polaroid cards, apparel), see a live preview, and add the personalized product to the cart. Every order arrives with a print-ready file.

For apparel, the PrintLab designer lets customers design the front and back with their own images, text and ready-made designs, pick several sizes at once, and see the print price as they design.

* Photo templates with shaped areas (hearts, letters, circles), text fields, fonts and colors
* Print prices by print size, front and back, with quantity discounts
* Extra charges per option, text length, font or add-on
* All extra charges are priced on the PrintLab server, never in the browser
* Print-ready files at the product's print size and resolution
* Works with the block cart and checkout and with HPOS order storage

== External service ==

This plugin connects to the PrintLab service at https://app.printlabapp.com, which is required for it to work:

* The product page loads the personalization box or the designer from app.printlabapp.com in an iframe. Photos the customer uploads are sent to PrintLab to build the design and the print file.
* When a personalized item is in the cart, the plugin asks PrintLab for the item's extra charge (only the design ID, the quantity and your store address are sent).
* When you click "Connect to PrintLab", WooCommerce creates REST API keys for PrintLab. PrintLab uses them to receive new orders (order number, items, the design IDs, and the billing name and email) so it can produce the print files.

PrintLab terms of service: https://printlabapp.com/terms
PrintLab privacy policy: https://printlabapp.com/privacy

== Installation ==

1. Install and activate the plugin.
2. Go to WooCommerce > PrintLab and click "Connect to PrintLab".
3. Open a product and, in the PrintLab box, either turn on the PrintLab designer or enter a PrintLab template ID.

== Changelog ==

= 0.2.0 =
* PrintLab designer for apparel: several sizes in one step, print price by size, set on the server.

= 0.1.0 =
* First version: personalization box, server-priced extra charges, order sync.
