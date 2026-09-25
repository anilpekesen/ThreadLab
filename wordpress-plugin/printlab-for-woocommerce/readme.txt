=== PrintLab for WooCommerce ===
Contributors: printlab
Tags: product personalizer, product designer, custom t-shirt, photo upload, print on demand
Requires at least: 6.4
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.2.1
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Product personalizer and t-shirt designer for WooCommerce. Customers add photos and text; you get a print-ready file with every order.

== Description ==

PrintLab adds a live personalization step to your product pages. Customers design the product themselves, see exactly what they will get, and add it to the cart. Every order arrives with a print-ready file, so you can send it straight to production.

= Two ways to personalize =

**Apparel designer** for t-shirts, sweatshirts, hoodies and similar products:

* Front and back design with the customer's own images, text, ready-made designs and cliparts
* Background removal and AI images (credits)
* Several sizes in one step, with the print price shown as the customer designs
* Print price by print size, front and back, with quantity discounts

**Photo templates** for frames, canvases, polaroid cards, calendars, mugs and gifts:

* Shaped photo areas (hearts, letters, circles) and text fields with fonts and colors
* Extra charges per option, text length, font or add-on
* Template generators: song cards, star maps, city maps, monograms, birth flowers, calendars, word searches, moon phases and QR codes

= Built for print shops =

* Print-ready files at the product's real print size and resolution
* Orders, production status and print files in one place, with gang sheets and a print queue
* Production status is added to the WooCommerce order; marking an order shipped completes it
* All extra charges are priced on the PrintLab server, never taken from the browser
* Works with the block cart and checkout and with HPOS order storage

= Requires a PrintLab account =

The designer, templates and print files run on the PrintLab service. Connecting your store creates your account. PrintLab has a free plan for up to 2 personalized products; paid plans add more products and production tools. Plans and prices are shown in PrintLab after you connect.

== External service ==

This plugin connects to the PrintLab service at https://app.printlabapp.com, which is required for it to work:

* The product page loads the designer or the personalization box from app.printlabapp.com in an iframe. Photos and images the customer adds are sent to PrintLab to build the design and the print file.
* When a personalized item is in the cart, the plugin asks PrintLab for the item's extra charge. Only the design ID, the quantity and your store address are sent.
* When you click "Connect to PrintLab", WooCommerce creates REST API keys for PrintLab. PrintLab uses them to read your products, receive new orders (order number, items, design IDs, and the billing name and email) and add production notes and status to those orders.
* When you open PrintLab or the product template list, the plugin sends a signed request with your store address to PrintLab.

PrintLab terms of service: https://printlabapp.com/terms-of-service
PrintLab privacy policy: https://printlabapp.com/privacy-policy

== Installation ==

1. Install and activate the plugin. WooCommerce must be active.
2. Go to WooCommerce > PrintLab and click "Connect to PrintLab". Approve the connection on the WooCommerce screen that opens.
3. Click "Open PrintLab" to set up print areas, print prices and templates.
4. Open a product. In the PrintLab box, turn on the designer (apparel) or choose a template (photo products), then update the product.

== Frequently Asked Questions ==

= Does it work with my theme? =

The designer and the personalization box load in an iframe, so they look the same in any theme. The designer appears below the product summary; the personalization box appears where the add to cart form is. The theme's own add to cart form is hidden on personalized products so that every order carries a design. It is tested with Storefront; if your theme places the product summary differently, contact us.

= Where do I set the print price? =

In PrintLab, under Product setup. You set the print sizes and a price for each size, separately for the front and the back, plus optional quantity discounts. The cart shows the product price plus the print price.

= Can the customer change the price in the browser? =

No. The plugin asks PrintLab for the extra charge of each design in the cart, and PrintLab calculates it from the saved design. If the price cannot be confirmed, checkout is blocked for that item.

= Where are the print files? =

In PrintLab, on the order and production screens. Each order line links to its print file and preview.

= What happens to my data if I remove the plugin? =

Deleting the plugin removes its cached data. The PrintLab settings on your products are kept, so they work again if you reinstall. You can remove PrintLab's access under WooCommerce > Settings > Advanced > REST API and Webhooks.

== Screenshots ==

1. The apparel designer on a product page, with sizes and the live print price
2. A photo frame template with several shaped photo areas
3. The cart with the design preview and the print price
4. The PrintLab box on the product edit screen: designer or template
5. The PrintLab admin: orders, production and print files

== Changelog ==

= 0.2.1 =
* The designer always receives the product, even when the page loads it before the plugin script.

= 0.2.0 =
* Apparel designer: front and back design, several sizes in one step, print price by size, set on the server.
* Template list on the product screen with previews.
* Open PrintLab from WordPress with a single click.
* Production status is written back to WooCommerce orders; cancelled orders are cancelled in PrintLab.

= 0.1.0 =
* First version: personalization box, server-priced extra charges, order sync.

== Upgrade Notice ==

= 0.2.1 =
Fixes the designer sometimes opening without the product.

= 0.2.0 =
Adds the apparel designer and the template list. Reconnect is not needed.
