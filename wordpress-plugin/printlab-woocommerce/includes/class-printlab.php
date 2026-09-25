<?php
defined( 'ABSPATH' ) || exit;

/**
 * PrintLab – WooCommerce köprüsü.
 */
final class PrintLab_Plugin {

	const META_TEMPLATE = '_printlab_template';
	const FEE_TTL       = 600;

	/** Sipariş satırına yazılan, yönetim ekranında gizlenen alanlar */
	const LINE_KEYS = array( 'printlab_design_token', 'printlab_print_file', 'printlab_print_files', 'printlab_preview_url', 'printlab_template' );

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'admin_menu', array( $this, 'admin_menu' ) );
		add_action( 'add_meta_boxes', array( $this, 'add_meta_box' ) );
		add_action( 'save_post_product', array( $this, 'save_meta_box' ) );

		add_action( 'woocommerce_before_add_to_cart_form', array( $this, 'render_personalizer' ), 5 );
		add_action( 'wp_ajax_printlab_add_to_cart', array( $this, 'ajax_add_to_cart' ) );
		add_action( 'wp_ajax_nopriv_printlab_add_to_cart', array( $this, 'ajax_add_to_cart' ) );

		add_action( 'woocommerce_before_calculate_totals', array( $this, 'apply_fees' ), 20 );
		add_action( 'woocommerce_check_cart_items', array( $this, 'check_cart_items' ) );
		add_filter( 'woocommerce_get_item_data', array( $this, 'cart_item_data' ), 10, 2 );
		add_filter( 'woocommerce_cart_item_thumbnail', array( $this, 'cart_item_thumbnail' ), 10, 2 );
		add_action( 'woocommerce_checkout_create_order_line_item', array( $this, 'order_line_item' ), 10, 3 );
		add_filter( 'woocommerce_hidden_order_itemmeta', array( $this, 'hidden_itemmeta' ) );
	}

	// ── Kimlik ─────────────────────────────────────────────────────────────

	/** PrintLab'deki mağaza kimliği: woo:<host> */
	public static function shop_key() {
		$parts = wp_parse_url( home_url() );
		$host  = strtolower( $parts['host'] ?? '' );
		if ( ! empty( $parts['port'] ) ) {
			$host .= ':' . (int) $parts['port'];
		}
		return 'woo:' . $host;
	}

	private static function app_url( $path ) {
		return rtrim( PRINTLAB_APP_URL, '/' ) . $path;
	}

	// ── Ayarlar ────────────────────────────────────────────────────────────

	public function admin_menu() {
		add_submenu_page( 'woocommerce', 'PrintLab', 'PrintLab', 'manage_woocommerce', 'printlab', array( $this, 'render_settings' ) );
	}

	private function is_connected() {
		$res = wp_remote_get( self::app_url( '/api/woo/status?shop=' . rawurlencode( self::shop_key() ) ), array( 'timeout' => 8 ) );
		if ( is_wp_error( $res ) ) {
			return null;
		}
		$body = json_decode( wp_remote_retrieve_body( $res ), true );
		return ! empty( $body['connected'] );
	}

	public function render_settings() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}
		$connected = $this->is_connected();
		$host      = substr( self::shop_key(), 4 );
		$auth_url  = add_query_arg(
			array(
				'app_name'     => 'PrintLab',
				'scope'        => 'read_write',
				'user_id'      => $host,
				'return_url'   => admin_url( 'admin.php?page=printlab' ),
				'callback_url' => self::app_url( '/api/woo/auth-callback' ),
			),
			home_url( '/wc-auth/v1/authorize' )
		);
		echo '<div class="wrap"><h1>PrintLab</h1>';
		if ( true === $connected ) {
			echo '<div class="notice notice-success inline"><p>' . esc_html__( 'Connected to PrintLab. Orders with personalized products are sent to PrintLab automatically.', 'printlab' ) . '</p></div>';
		} elseif ( null === $connected ) {
			echo '<div class="notice notice-warning inline"><p>' . esc_html__( 'PrintLab could not be reached. Try again in a moment.', 'printlab' ) . '</p></div>';
		} else {
			echo '<p>' . esc_html__( 'Connect your store so PrintLab can receive personalized orders and print files.', 'printlab' ) . '</p>';
		}
		echo '<p><a class="button button-primary" href="' . esc_url( $auth_url ) . '">' . esc_html( $connected ? __( 'Reconnect', 'printlab' ) : __( 'Connect to PrintLab', 'printlab' ) ) . '</a></p>';
		echo '<p class="description">' . esc_html__( 'To personalize a product, open it and enter the PrintLab template ID in the PrintLab box.', 'printlab' ) . '</p>';
		echo '</div>';
	}

	// ── Ürün ayarı ─────────────────────────────────────────────────────────

	public function add_meta_box() {
		add_meta_box( 'printlab', 'PrintLab', array( $this, 'render_meta_box' ), 'product', 'side' );
	}

	public function render_meta_box( $post ) {
		wp_nonce_field( 'printlab_meta', 'printlab_meta_nonce' );
		$value = get_post_meta( $post->ID, self::META_TEMPLATE, true );
		echo '<p><label for="printlab_template">' . esc_html__( 'Personalizer template ID', 'printlab' ) . '</label></p>';
		echo '<input type="text" id="printlab_template" name="printlab_template" class="widefat" value="' . esc_attr( $value ) . '" placeholder="e.g. 97226bf1d8933843ea2ab2da" />';
		echo '<p class="description">' . esc_html__( 'Leave empty to sell the product without personalization.', 'printlab' ) . '</p>';
	}

	public function save_meta_box( $post_id ) {
		if ( ! isset( $_POST['printlab_meta_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['printlab_meta_nonce'] ) ), 'printlab_meta' ) ) {
			return;
		}
		if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
			return;
		}
		if ( ! current_user_can( 'edit_product', $post_id ) ) {
			return;
		}
		$value = isset( $_POST['printlab_template'] ) ? sanitize_text_field( wp_unslash( $_POST['printlab_template'] ) ) : '';
		$value = preg_replace( '/[^a-zA-Z0-9_-]/', '', $value );
		if ( '' === $value ) {
			delete_post_meta( $post_id, self::META_TEMPLATE );
		} else {
			update_post_meta( $post_id, self::META_TEMPLATE, $value );
		}
	}

	// ── Ürün sayfası ───────────────────────────────────────────────────────

	/** iframe'e gönderilecek seçenekler ve varyantlar (kişiselleştiricinin beklediği biçim) */
	private function product_payload( WC_Product $product ) {
		$fmt = function ( $price ) {
			return html_entity_decode( wp_strip_all_tags( wc_price( $price ) ) );
		};
		if ( ! $product->is_type( 'variable' ) ) {
			$price = (float) wc_get_price_to_display( $product );
			return array(
				'options'  => array(),
				'variants' => array(
					array(
						'id'          => $product->get_id(),
						'options'     => array(),
						'price'       => $fmt( $price ),
						'price_cents' => (int) round( $price * 100 ),
						'available'   => $product->is_in_stock(),
					),
				),
			);
		}
		$attrs   = $product->get_variation_attributes();
		$options = array();
		$names   = array();
		foreach ( $attrs as $attr => $values ) {
			$label  = wc_attribute_label( $attr, $product );
			$shown  = array();
			foreach ( $values as $v ) {
				$shown[] = $this->attr_value_name( $attr, $v );
			}
			$options[] = array( 'name' => $label, 'values' => $shown );
			$names[]   = $attr;
		}
		$variants = array();
		foreach ( $product->get_available_variations( 'objects' ) as $variation ) {
			$vals = array();
			$va   = $variation->get_variation_attributes( false );
			foreach ( $names as $attr ) {
				$key    = sanitize_title( $attr );
				$raw    = $va[ $key ] ?? ( $va[ 'attribute_' . $key ] ?? '' );
				$vals[] = $this->attr_value_name( $attr, $raw );
			}
			$price      = (float) wc_get_price_to_display( $variation );
			$variants[] = array(
				'id'          => $variation->get_id(),
				'options'     => $vals,
				'price'       => $fmt( $price ),
				'price_cents' => (int) round( $price * 100 ),
				'available'   => $variation->is_in_stock(),
			);
		}
		return array( 'options' => $options, 'variants' => $variants );
	}

	/** Taksonomi özniteliğinde değer slug'dır; görünen ad terimden alınır */
	private function attr_value_name( $attr, $value ) {
		if ( taxonomy_exists( $attr ) ) {
			$term = get_term_by( 'slug', $value, $attr );
			if ( $term ) {
				return $term->name;
			}
		}
		return $value;
	}

	public function render_personalizer() {
		global $product;
		if ( ! $product instanceof WC_Product ) {
			return;
		}
		$template = get_post_meta( $product->get_id(), self::META_TEMPLATE, true );
		if ( ! $template ) {
			return;
		}
		$payload = $this->product_payload( $product );
		$first   = $payload['variants'][0]['id'] ?? $product->get_id();
		$src     = add_query_arg(
			array(
				'templateId' => $template,
				'productId'  => $product->get_id(),
				'variantId'  => $first,
				'shop'       => self::shop_key(),
				'locale'     => substr( get_locale(), 0, 2 ),
			),
			self::app_url( '/embed/personalizer' )
		);

		wp_enqueue_script( 'printlab', plugins_url( 'assets/printlab.js', PRINTLAB_FILE ), array(), PRINTLAB_VERSION, true );
		wp_localize_script(
			'printlab',
			'PrintLabData',
			array(
				'appOrigin' => rtrim( PRINTLAB_APP_URL, '/' ),
				'ajaxUrl'   => admin_url( 'admin-ajax.php' ),
				'nonce'     => wp_create_nonce( 'printlab_cart' ),
				'cartUrl'   => wc_get_cart_url(),
				'productId' => $product->get_id(),
				'currency'  => get_woocommerce_currency(),
				'options'   => $payload['options'],
				'variants'  => $payload['variants'],
				'error'     => __( 'Could not add to cart. Please try again.', 'printlab' ),
			)
		);
		// Temanın kendi sepete ekle formu gizlenir: tasarımsız sipariş olmasın
		echo '<style>.single-product form.cart{display:none!important}</style>';
		echo '<div class="printlab-personalizer" style="margin:0 0 1.5em">';
		echo '<iframe id="printlab-frame" src="' . esc_url( $src ) . '" style="width:100%;min-height:520px;border:0;display:block" allow="clipboard-write" title="' . esc_attr__( 'Personalize', 'printlab' ) . '"></iframe>';
		echo '</div>';
	}

	// ── Sepete ekleme ──────────────────────────────────────────────────────

	public function ajax_add_to_cart() {
		check_ajax_referer( 'printlab_cart', 'nonce' );
		$product_id   = absint( $_POST['product_id'] ?? 0 );
		$variation_id = absint( $_POST['variation_id'] ?? 0 );
		$quantity     = max( 1, absint( $_POST['quantity'] ?? 1 ) );
		$props_raw    = isset( $_POST['properties'] ) ? json_decode( wp_unslash( $_POST['properties'] ), true ) : array(); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- tek tek temizleniyor
		$product      = wc_get_product( $product_id );
		if ( ! $product || ! get_post_meta( $product_id, self::META_TEMPLATE, true ) ) {
			wp_send_json_error( array( 'message' => 'product' ), 400 );
		}

		$props = array();
		foreach ( (array) $props_raw as $k => $v ) {
			if ( is_scalar( $v ) ) {
				$props[ sanitize_text_field( (string) $k ) ] = sanitize_text_field( (string) $v );
			}
		}
		$token = $props['_design_token'] ?? '';
		if ( ! preg_match( '/^[a-zA-Z0-9_]{8,80}$/', $token ) ) {
			wp_send_json_error( array( 'message' => 'design' ), 400 );
		}

		$variation = array();
		if ( $product->is_type( 'variable' ) ) {
			$var = wc_get_product( $variation_id );
			if ( ! $var || $var->get_parent_id() !== $product_id ) {
				wp_send_json_error( array( 'message' => 'variation' ), 400 );
			}
			$variation = wc_get_product_variation_attributes( $variation_id );
		} else {
			$variation_id = 0;
		}

		$display = array();
		foreach ( $props as $k => $v ) {
			if ( '' !== $k && '_' !== $k[0] && '' !== $v ) {
				$display[ $k ] = $v;
			}
		}
		$data = array(
			'printlab' => array(
				'token'       => $token,
				'template'    => $props['_personalizer_template'] ?? '',
				'print_file'  => esc_url_raw( $props['_print_file'] ?? '' ),
				'print_files' => $props['_print_files'] ?? '',
				'preview'     => esc_url_raw( $props['_front_preview_url'] ?? '' ),
				'display'     => $display,
			),
		);
		$key = WC()->cart->add_to_cart( $product_id, $quantity, $variation_id, $variation, $data );
		if ( ! $key ) {
			wp_send_json_error( array( 'message' => 'cart' ), 400 );
		}
		wp_send_json_success( array( 'cartUrl' => wc_get_cart_url() ) );
	}

	// ── Fiyat ──────────────────────────────────────────────────────────────

	/** Tasarımın ek ücreti; PrintLab'in kaydettiği tutar (önbellek 10 dk). null = alınamadı */
	private function fee_for( $token ) {
		$cache_key = 'printlab_fee_' . md5( $token );
		$cached    = get_transient( $cache_key );
		if ( false !== $cached ) {
			return (float) $cached;
		}
		$url = self::app_url( '/api/woo/quote?shop=' . rawurlencode( self::shop_key() ) . '&token=' . rawurlencode( $token ) );
		$res = wp_remote_get( $url, array( 'timeout' => 8 ) );
		if ( is_wp_error( $res ) || 200 !== wp_remote_retrieve_response_code( $res ) ) {
			return null;
		}
		$body = json_decode( wp_remote_retrieve_body( $res ), true );
		if ( ! isset( $body['fee'] ) || ! is_numeric( $body['fee'] ) ) {
			return null;
		}
		$fee = max( 0, (float) $body['fee'] );
		set_transient( $cache_key, $fee, self::FEE_TTL );
		return $fee;
	}

	/**
	 * Satır fiyatı = ürünün kendi fiyatı + PrintLab ek ücreti. Temel fiyat her
	 * seferinde üründen okunur: bu kanca bir istekte birden çok kez çalışır,
	 * sepetteki fiyatın üstüne eklemek ücreti katlardı.
	 */
	public function apply_fees( $cart ) {
		if ( is_admin() && ! wp_doing_ajax() ) {
			return;
		}
		foreach ( $cart->get_cart() as $key => $item ) {
			if ( empty( $item['printlab']['token'] ) ) {
				continue;
			}
			$fee = $this->fee_for( $item['printlab']['token'] );
			$cart->cart_contents[ $key ]['printlab']['fee'] = $fee;
			if ( null === $fee ) {
				continue;
			}
			$source = wc_get_product( $item['variation_id'] ? $item['variation_id'] : $item['product_id'] );
			if ( $source ) {
				$item['data']->set_price( (float) $source->get_price( 'edit' ) + $fee );
			}
		}
	}

	/** Ücreti doğrulanamayan tasarım ödemeye geçemez (eksik fiyatla satış olmasın) */
	public function check_cart_items() {
		foreach ( WC()->cart->get_cart() as $item ) {
			if ( ! empty( $item['printlab']['token'] ) && null === $this->fee_for( $item['printlab']['token'] ) ) {
				wc_add_notice( __( 'The price of a personalized item could not be confirmed. Please try again in a moment or save your design again.', 'printlab' ), 'error' );
				return;
			}
		}
	}

	// ── Sepet ve sipariş görünümü ──────────────────────────────────────────

	public function cart_item_data( $data, $item ) {
		if ( empty( $item['printlab'] ) ) {
			return $data;
		}
		foreach ( (array) ( $item['printlab']['display'] ?? array() ) as $k => $v ) {
			$data[] = array( 'key' => $k, 'value' => $v );
		}
		$fee = $item['printlab']['fee'] ?? null;
		if ( $fee ) {
			$data[] = array( 'key' => __( 'Personalization', 'printlab' ), 'value' => wp_strip_all_tags( wc_price( $fee ) ) );
		}
		return $data;
	}

	public function cart_item_thumbnail( $thumb, $item ) {
		if ( ! empty( $item['printlab']['preview'] ) ) {
			return '<img src="' . esc_url( $item['printlab']['preview'] ) . '" alt="" style="max-width:100%;height:auto" />';
		}
		return $thumb;
	}

	/** Tasarım bilgisi sipariş satırına; PrintLab webhook'la okur */
	public function order_line_item( $item, $cart_item_key, $values ) {
		if ( empty( $values['printlab']['token'] ) ) {
			return;
		}
		$p = $values['printlab'];
		$item->add_meta_data( 'printlab_design_token', $p['token'], true );
		$item->add_meta_data( 'printlab_template', $p['template'] ?? '', true );
		$item->add_meta_data( 'printlab_print_file', $p['print_file'] ?? '', true );
		$item->add_meta_data( 'printlab_print_files', $p['print_files'] ?? '', true );
		$item->add_meta_data( 'printlab_preview_url', $p['preview'] ?? '', true );
		foreach ( (array) ( $p['display'] ?? array() ) as $k => $v ) {
			$item->add_meta_data( $k, $v, true );
		}
	}

	public function hidden_itemmeta( $keys ) {
		return array_merge( $keys, self::LINE_KEYS );
	}
}
