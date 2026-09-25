<?php
/**
 * Eklenti silinince geçici önbellekler temizlenir. Ürünlerdeki PrintLab
 * ayarları (şablon, tasarımcı) bırakılır: eklenti yeniden kurulunca ürünler
 * aynen çalışsın. PrintLab'deki mağaza bağlantısı WooCommerce > Settings >
 * Advanced > REST API ve Webhooks altından kaldırılabilir.
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

global $wpdb;
// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- tek seferlik temizlik
$wpdb->query(
	$wpdb->prepare(
		"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
		$wpdb->esc_like( '_transient_printlab_' ) . '%',
		$wpdb->esc_like( '_transient_timeout_printlab_' ) . '%'
	)
);
