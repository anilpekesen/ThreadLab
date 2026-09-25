<?php
/**
 * Plugin Name:       PrintLab – Product Personalizer for WooCommerce
 * Plugin URI:        https://printlabapp.com
 * Description:       Let customers personalize products with photos and text, and get print-ready files for every order.
 * Version:           0.2.0
 * Requires at least: 6.4
 * Requires PHP:      7.4
 * Author:            PrintLab
 * License:           GPL-2.0-or-later
 * Text Domain:       printlab
 * WC requires at least: 8.0
 *
 * Tasarım, şablonlar ve baskı dosyası PrintLab sunucusunda üretilir; eklenti
 * WooCommerce ile PrintLab arasında köprüdür:
 *   - ürün sayfasında kişiselleştirme kutusu (iframe),
 *   - sepete ekleme (sunucu tarafında, WC()->cart),
 *   - ek ücret: sepet hesabında PrintLab'den sorulur, tarayıcıdan gelmez,
 *   - tasarım bilgisinin sipariş satırına yazılması.
 */

defined( 'ABSPATH' ) || exit;

define( 'PRINTLAB_VERSION', '0.2.0' );
define( 'PRINTLAB_FILE', __FILE__ );

if ( ! defined( 'PRINTLAB_APP_URL' ) ) {
	define( 'PRINTLAB_APP_URL', 'https://app.printlabapp.com' );
}

// Yeni sipariş tabloları (HPOS) ve blok sepet/ödeme ile uyumlu
add_action( 'before_woocommerce_init', function () {
	if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
		\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', PRINTLAB_FILE, true );
		\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'cart_checkout_blocks', PRINTLAB_FILE, true );
	}
} );

add_action( 'plugins_loaded', function () {
	if ( ! class_exists( 'WooCommerce' ) ) {
		return;
	}
	require_once __DIR__ . '/includes/class-printlab.php';
	PrintLab_Plugin::instance();
} );
