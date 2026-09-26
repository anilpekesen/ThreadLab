<?php
defined( 'ABSPATH' ) || exit;

/**
 * PrintLab – WooCommerce köprüsü.
 */
final class PrintLab_Plugin {

	const META_TEMPLATE = '_printlab_template';
	const META_DESIGNER = '_printlab_designer';
	const FEE_TTL       = 600;

	/** Sipariş satırına yazılan, yönetim ekranında gizlenen alanlar */
	const LINE_KEYS = array( 'printlab_design_token', 'printlab_print_file', 'printlab_print_files', 'printlab_preview_url', 'printlab_template', 'printlab_front_print_url', 'printlab_back_print_url', 'printlab_back_preview_url', 'printlab_design_detail_url', 'printlab_pl_size', 'printlab_pl_color', 'printlab_pl_locale' );

	/** Tasarımcının sepete gönderdiği, siparişe `printlab_*` olarak yazılan alanlar */
	const DESIGNER_KEYS = array( '_front_print_url', '_back_print_url', '_back_preview_url', '_design_detail_url', '_pl_size', '_pl_color', '_pl_locale' );

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'admin_menu', array( $this, 'admin_menu' ) );
		add_action( 'admin_post_printlab_open', array( $this, 'open_app' ) );
		add_action( 'add_meta_boxes', array( $this, 'add_meta_box' ) );
		add_action( 'save_post_product', array( $this, 'save_meta_box' ) );

		add_action( 'woocommerce_before_add_to_cart_form', array( $this, 'render_personalizer' ), 5 );
		add_action( 'wp_ajax_printlab_add_to_cart', array( $this, 'ajax_add_to_cart' ) );
		add_action( 'wp_ajax_nopriv_printlab_add_to_cart', array( $this, 'ajax_add_to_cart' ) );
		add_action( 'woocommerce_after_single_product_summary', array( $this, 'render_designer' ), 5 );
		add_action( 'wp_ajax_printlab_add_designer', array( $this, 'ajax_add_designer' ) );
		add_action( 'wp_ajax_nopriv_printlab_add_designer', array( $this, 'ajax_add_designer' ) );

		add_action( 'woocommerce_before_calculate_totals', array( $this, 'apply_fees' ), 20 );
		add_action( 'woocommerce_check_cart_items', array( $this, 'check_cart_items' ) );
		add_filter( 'woocommerce_get_item_data', array( $this, 'cart_item_data' ), 10, 2 );
		add_filter( 'woocommerce_cart_item_thumbnail', array( $this, 'cart_item_thumbnail' ), 10, 2 );
		add_filter( 'woocommerce_store_api_cart_item_images', array( $this, 'block_cart_images' ), 10, 2 );
		add_action( 'woocommerce_checkout_create_order_line_item', array( $this, 'order_line_item' ), 10, 3 );
		add_filter( 'woocommerce_hidden_order_itemmeta', array( $this, 'hidden_itemmeta' ) );
		add_filter( 'woocommerce_order_item_get_formatted_meta_data', array( $this, 'hide_formatted_meta' ) );
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
			echo '<div class="notice notice-success inline"><p>' . esc_html__( 'Connected to PrintLab. Orders with personalized products are sent to PrintLab automatically.', 'printlab-for-woocommerce' ) . '</p></div>';
			$open = wp_nonce_url( admin_url( 'admin-post.php?action=printlab_open' ), 'printlab_open' );
			echo '<p><a class="button button-primary button-hero" href="' . esc_url( $open ) . '" target="_blank" rel="noopener">' . esc_html__( 'Open PrintLab', 'printlab-for-woocommerce' ) . '</a></p>';
			echo '<p class="description">' . esc_html__( 'Set up print areas, print prices and templates, and see your orders and print files.', 'printlab-for-woocommerce' ) . '</p>';
		} elseif ( null === $connected ) {
			echo '<div class="notice notice-warning inline"><p>' . esc_html__( 'PrintLab could not be reached. Try again in a moment.', 'printlab-for-woocommerce' ) . '</p></div>';
		} else {
			echo '<p>' . esc_html__( 'Connect your store so PrintLab can receive personalized orders and print files.', 'printlab-for-woocommerce' ) . '</p>';
		}
		echo '<p><a class="button' . ( $connected ? '' : ' button-primary' ) . '" href="' . esc_url( $auth_url ) . '">' . esc_html( $connected ? __( 'Reconnect', 'printlab-for-woocommerce' ) : __( 'Connect to PrintLab', 'printlab-for-woocommerce' ) ) . '</a></p>';
		echo '<p class="description">' . esc_html__( 'To personalize a product, open it and either turn on the PrintLab designer or enter a PrintLab template ID in the PrintLab box. Print areas and print prices are set in the PrintLab app.', 'printlab-for-woocommerce' ) . '</p>';
		echo '</div>';
	}

	// ── Şablon listesi ─────────────────────────────────────────────────────

	/**
	 * PrintLab'e giden isteklerin imza sırrı: PrintLab'in bağlanırken kurduğu
	 * webhook'un sırrı. Ayrı bir anahtar saklanmaz; yeniden bağlanınca yenilenir.
	 */
	private static function signing_secret() {
		$prefix = self::app_url( '/webhooks/woo' );
		$store  = WC_Data_Store::load( 'webhook' );
		foreach ( $store->search_webhooks( array( 'status' => 'active', 'limit' => -1 ) ) as $id ) {
			$hook = wc_get_webhook( $id );
			if ( $hook && 0 === strpos( $hook->get_delivery_url(), $prefix ) && $hook->get_secret() ) {
				return $hook->get_secret();
			}
		}
		return '';
	}

	/** Mağazanın PrintLab şablonları; null = alınamadı (bağlı değil ya da hata) */
	private function templates() {
		$cached = get_transient( 'printlab_templates' );
		if ( is_array( $cached ) ) {
			return $cached;
		}
		$secret = self::signing_secret();
		if ( ! $secret ) {
			return null;
		}
		$shop = self::shop_key();
		$ts   = (string) time();
		$url  = add_query_arg(
			array(
				'shop' => rawurlencode( $shop ),
				'ts'   => $ts,
				'sig'  => hash_hmac( 'sha256', $shop . "\n" . $ts, $secret ),
			),
			self::app_url( '/api/woo/templates' )
		);
		$res = wp_remote_get( $url, array( 'timeout' => 8 ) );
		if ( is_wp_error( $res ) || 200 !== wp_remote_retrieve_response_code( $res ) ) {
			return null;
		}
		$body = json_decode( wp_remote_retrieve_body( $res ), true );
		if ( ! isset( $body['templates'] ) || ! is_array( $body['templates'] ) ) {
			return null;
		}
		set_transient( 'printlab_templates', $body['templates'], MINUTE_IN_SECONDS );
		return $body['templates'];
	}

	/**
	 * PrintLab yönetimini aç: WordPress'te oturum açmış mağaza yöneticisi için
	 * tek kullanımlık, 2 dakikalık imzalı giriş bağlantısı üretip yönlendirir.
	 * Bağlantı sayfaya yazılmaz; yalnız düğmeye basılınca oluşur.
	 */
	public function open_app() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( esc_html__( 'You do not have permission to open PrintLab.', 'printlab-for-woocommerce' ), 403 );
		}
		check_admin_referer( 'printlab_open' );
		$secret = self::signing_secret();
		if ( ! $secret ) {
			wp_safe_redirect( admin_url( 'admin.php?page=printlab' ) );
			exit;
		}
		$shop  = self::shop_key();
		$ts    = (string) time();
		$nonce = wp_generate_password( 32, false, false );
		$url   = add_query_arg(
			array(
				'shop'  => rawurlencode( $shop ),
				'ts'    => $ts,
				'nonce' => $nonce,
				'sig'   => hash_hmac( 'sha256', "login\n" . $shop . "\n" . $ts . "\n" . $nonce, $secret ),
			),
			self::app_url( '/auth/woo' )
		);
		// Harici adres: wp_safe_redirect yalnız aynı siteye izin verir
		wp_redirect( $url ); // phpcs:ignore WordPress.Security.SafeRedirect.wp_redirect_wp_redirect
		exit;
	}

	// ── Ürün ayarı ─────────────────────────────────────────────────────────

	public function add_meta_box() {
		add_meta_box( 'printlab', 'PrintLab', array( $this, 'render_meta_box' ), 'product', 'side' );
	}

	public function render_meta_box( $post ) {
		wp_nonce_field( 'printlab_meta', 'printlab_meta_nonce' );
		$value    = get_post_meta( $post->ID, self::META_TEMPLATE, true );
		$designer = 'yes' === get_post_meta( $post->ID, self::META_DESIGNER, true );
		echo '<p><label><input type="checkbox" name="printlab_designer" value="yes"' . checked( $designer, true, false ) . ' /> ' . esc_html__( 'Show the PrintLab designer (apparel, print by size)', 'printlab-for-woocommerce' ) . '</label></p>';
		echo '<p><label for="printlab_template">' . esc_html__( 'Personalizer template', 'printlab-for-woocommerce' ) . '</label></p>';
		$templates = $this->templates();
		if ( null === $templates ) {
			// Liste alınamadı: kimlik elle girilebilsin
			echo '<input type="text" id="printlab_template" name="printlab_template" class="widefat" value="' . esc_attr( $value ) . '" placeholder="e.g. 97226bf1d8933843ea2ab2da" />';
			echo '<p class="description">' . esc_html__( 'Connect your store in WooCommerce > PrintLab to choose from your templates. You can also paste a template ID.', 'printlab-for-woocommerce' ) . '</p>';
			return;
		}
		$known   = wp_list_pluck( $templates, 'id' );
		$preview = '';
		echo '<select id="printlab_template" name="printlab_template" class="widefat">';
		echo '<option value="">' . esc_html__( 'No template', 'printlab-for-woocommerce' ) . '</option>';
		foreach ( $templates as $t ) {
			$id    = (string) ( $t['id'] ?? '' );
			$label = (string) ( $t['name'] ?? $id );
			if ( ! empty( $t['photos'] ) ) {
				/* translators: %d: number of photos */
				$label .= ' (' . sprintf( _n( '%d photo', '%d photos', (int) $t['photos'], 'printlab-for-woocommerce' ), (int) $t['photos'] ) . ')';
			}
			if ( $id === $value ) {
				$preview = (string) ( $t['previewUrl'] ?? '' );
			}
			echo '<option value="' . esc_attr( $id ) . '" data-preview="' . esc_url( $t['previewUrl'] ?? '' ) . '"' . selected( $id, $value, false ) . '>' . esc_html( $label ) . '</option>';
		}
		// Başka yerden kopyalanmış, listede olmayan kimlik kaybolmasın
		if ( $value && ! in_array( $value, $known, true ) ) {
			echo '<option value="' . esc_attr( $value ) . '" selected>' . esc_html( $value ) . '</option>';
		}
		echo '</select>';
		echo '<p><img id="printlab_template_preview" src="' . esc_url( $preview ) . '" alt="" style="max-width:100%;height:auto;margin-top:8px;border-radius:4px;' . ( $preview ? '' : 'display:none' ) . '" /></p>';
		if ( ! $templates ) {
			echo '<p class="description">' . esc_html__( 'You have no photo templates yet. Create one in the PrintLab app.', 'printlab-for-woocommerce' ) . '</p>';
		} else {
			echo '<p class="description">' . esc_html__( 'Choose "No template" to sell the product without personalization.', 'printlab-for-woocommerce' ) . '</p>';
		}
		echo "<script>(function(){var s=document.getElementById('printlab_template'),i=document.getElementById('printlab_template_preview');if(!s||!i)return;s.addEventListener('change',function(){var o=s.options[s.selectedIndex],u=o&&o.getAttribute('data-preview');i.src=u||'';i.style.display=u?'':'none';});})();</script>";
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
		if ( ! empty( $_POST['printlab_designer'] ) ) {
			update_post_meta( $post_id, self::META_DESIGNER, 'yes' );
		} else {
			delete_post_meta( $post_id, self::META_DESIGNER );
		}
		$value = isset( $_POST['printlab_template'] ) ? sanitize_text_field( wp_unslash( $_POST['printlab_template'] ) ) : '';
		$value    = preg_replace( '/[^a-zA-Z0-9_-]/', '', $value );
		$previous = (string) get_post_meta( $post_id, self::META_TEMPLATE, true );
		if ( '' === $value ) {
			delete_post_meta( $post_id, self::META_TEMPLATE );
		} else {
			update_post_meta( $post_id, self::META_TEMPLATE, $value );
		}
		if ( $previous !== $value ) {
			$this->notify_link( $post_id, $value );
		}
	}

	/**
	 * Şablon seçimi PrintLab'e bildirilir (imzalı); PrintLab'deki "bağlı ürün"
	 * listesi WordPress'teki seçimle aynı kalır. Kaydetmeyi bekletmemek için
	 * yanıt beklenmez.
	 */
	private function notify_link( $post_id, $template ) {
		$secret = self::signing_secret();
		if ( ! $secret ) {
			return;
		}
		$shop = self::shop_key();
		$ts   = (string) time();
		$pid  = (string) absint( $post_id );
		wp_remote_post(
			self::app_url( '/api/woo/product-link' ),
			array(
				'timeout'  => 5,
				'blocking' => false,
				'body'     => array(
					'shop'        => $shop,
					'ts'          => $ts,
					'product_id'  => $pid,
					'template_id' => $template,
					'title'       => get_the_title( $post_id ),
					'slug'        => get_post_field( 'post_name', $post_id ),
					'sig'         => hash_hmac( 'sha256', "link\n" . $shop . "\n" . $ts . "\n" . $pid . "\n" . $template, $secret ),
				),
			)
		);
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
		if ( ! $template || self::is_designer( $product->get_id() ) ) {
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
				'error'     => __( 'Could not add to cart. Please try again.', 'printlab-for-woocommerce' ),
			)
		);
		// Temanın kendi sepete ekle formu gizlenir: tasarımsız sipariş olmasın
		echo '<style>.single-product form.cart{display:none!important}</style>';
		echo '<div class="printlab-personalizer" style="margin:0 0 1.5em">';
		echo '<iframe id="printlab-frame" src="' . esc_url( $src ) . '" style="width:100%;min-height:520px;border:0;display:block" allow="clipboard-write" title="' . esc_attr__( 'Personalize', 'printlab-for-woocommerce' ) . '"></iframe>';
		echo '</div>';
	}

	private static function is_designer( $product_id ) {
		return 'yes' === get_post_meta( $product_id, self::META_DESIGNER, true );
	}

	/**
	 * Tasarımcıya giden varyantlar, Shopify'ın ürün JSON'uyla aynı biçimde
	 * (option1..3, fiyat kuruş cinsinden): tasarımcı renk ve beden seçimini
	 * bu alanlardan kurar.
	 */
	private function designer_variants( WC_Product $product ) {
		$names = array();
		$attrs = $product->is_type( 'variable' ) ? array_slice( $product->get_variation_attributes(), 0, 3, true ) : array();
		foreach ( $attrs as $attr => $values ) {
			$names[ $attr ] = wc_attribute_label( $attr, $product );
		}
		$image = function ( $p ) {
			$id = $p->get_image_id();
			return $id ? array( 'src' => wp_get_attachment_image_url( $id, 'full' ) ) : null;
		};
		$variants = array();
		if ( ! $product->is_type( 'variable' ) ) {
			$variants[] = array(
				'id'             => $product->get_id(),
				'title'          => $product->get_name(),
				'option1'        => null,
				'option2'        => null,
				'option3'        => null,
				'price'          => (int) round( (float) wc_get_price_to_display( $product ) * 100 ),
				'available'      => $product->is_in_stock(),
				'featured_image' => $image( $product ),
			);
		} else {
			foreach ( $product->get_available_variations( 'objects' ) as $variation ) {
				$va   = $variation->get_variation_attributes( false );
				$opts = array();
				foreach ( array_keys( $names ) as $attr ) {
					$key    = sanitize_title( $attr );
					$opts[] = $this->attr_value_name( $attr, $va[ $key ] ?? ( $va[ 'attribute_' . $key ] ?? '' ) );
				}
				$variants[] = array(
					'id'             => $variation->get_id(),
					'title'          => implode( ' / ', $opts ),
					'option1'        => $opts[0] ?? null,
					'option2'        => $opts[1] ?? null,
					'option3'        => $opts[2] ?? null,
					'price'          => (int) round( (float) wc_get_price_to_display( $variation ) * 100 ),
					'available'      => $variation->is_in_stock(),
					'featured_image' => $variation->get_image_id() !== $product->get_image_id() ? $image( $variation ) : null,
				);
			}
		}
		return array( 'variants' => $variants, 'optionNames' => array_values( $names ) );
	}

	/** Tişört tasarımcısı: ürün özetinin altında, içerik sütunu genişliğinde */
	public function render_designer() {
		global $product;
		if ( ! $product instanceof WC_Product || ! self::is_designer( $product->get_id() ) ) {
			return;
		}
		$v       = $this->designer_variants( $product );
		$gallery = $product->get_gallery_image_ids();
		$front   = $product->get_image_id() ? wp_get_attachment_image_url( $product->get_image_id(), 'full' ) : '';
		$back    = $gallery ? wp_get_attachment_image_url( $gallery[0], 'full' ) : $front;
		$app     = rtrim( PRINTLAB_APP_URL, '/' );

		wp_enqueue_script( 'printlab-designer', plugins_url( 'assets/printlab-designer.js', PRINTLAB_FILE ), array(), PRINTLAB_VERSION, true );
		wp_localize_script(
			'printlab-designer',
			'PrintLabDesigner',
			array(
				'appOrigin'   => $app,
				'ajaxUrl'     => admin_url( 'admin-ajax.php' ),
				'nonce'       => wp_create_nonce( 'printlab_cart' ),
				'cartUrl'     => wc_get_cart_url(),
				'checkoutUrl' => wc_get_checkout_url(),
				'productId'   => $product->get_id(),
				'config'      => array(
					'productId'      => (string) $product->get_id(),
					'productHandle'  => $product->get_slug(),
					'productTitle'   => $product->get_name(),
					'frontImage'     => $front ? $front : '',
					'backImage'      => $back ? $back : '',
					'shirtColor'     => '#1C1C1E',
					'variants'       => $v['variants'],
					'selectedVariant' => $v['variants'][0] ?? null,
					'optionNames'    => $v['optionNames'],
					'currency'       => get_woocommerce_currency(),
					'locale'         => str_replace( '_', '-', get_locale() ),
					'uploadEndpoint' => $app . '/apps/tshirt-designer/upload',
					'shop'           => self::shop_key(),
					'singleVariantId' => '',
					'doubleVariantId' => '',
					'singlePrice'    => 0,
					'doublePrice'    => 0,
				),
				'error'       => __( 'Could not add to cart. Please try again.', 'printlab-for-woocommerce' ),
			)
		);
		// Temanın kendi sepete ekle formu gizlenir: tasarımsız sipariş olmasın
		// Storefront'un yapışkan "Seçenekleri seç" çubuğu da gizli forma götürüyor
		echo '<style>.single-product form.cart,.storefront-sticky-add-to-cart{display:none!important}'
			// Temaların ürün kutusu çoğu zaman overflow:hidden; 100vw taşması kırpılıyor.
			// İçerik sütununun tam genişliği her temada güvenli.
			. '.printlab-designer{width:100%;margin:0 0 2em;clear:both;background:#f3f4f6}'
			. '.printlab-designer iframe{display:block;width:100%;height:960px;border:0}'
			. '@media (max-width:859px){.printlab-designer iframe{height:1320px}}</style>';
		echo '<div class="printlab-designer"><iframe id="printlab-designer-frame" src="' . esc_url( $app . '/designer-app/' ) . '" allow="camera; microphone" title="' . esc_attr__( 'Design your product', 'printlab-for-woocommerce' ) . '"></iframe></div>';
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

	/**
	 * Tasarımcıdan gelen sepet: bir tasarım, birden çok beden/varyant. Fiyat
	 * burada alınmaz; satır fiyatı sepet hesabında PrintLab'den sorulur.
	 */
	public function ajax_add_designer() {
		check_ajax_referer( 'printlab_cart', 'nonce' );
		$product_id = absint( $_POST['product_id'] ?? 0 );
		$items_raw  = isset( $_POST['items'] ) ? json_decode( wp_unslash( $_POST['items'] ), true ) : array(); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- tek tek temizleniyor
		$props_raw  = isset( $_POST['properties'] ) ? json_decode( wp_unslash( $_POST['properties'] ), true ) : array(); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- tek tek temizleniyor
		$product    = wc_get_product( $product_id );
		if ( ! $product || ! self::is_designer( $product_id ) || ! is_array( $items_raw ) || ! $items_raw ) {
			wp_send_json_error( array( 'message' => 'product' ), 400 );
		}
		// Adresler esc_url_raw ile: sanitize_text_field %3A gibi kodlanmış
		// karakterleri siler ve bağlantıyı bozar (shop=woo%3A... → shop=woo...)
		$clean = function ( $arr ) {
			$out = array();
			foreach ( (array) $arr as $k => $v ) {
				if ( is_scalar( $v ) ) {
					$key         = sanitize_text_field( (string) $k );
					$out[ $key ] = '_url' === substr( $key, -4 ) ? esc_url_raw( (string) $v ) : sanitize_text_field( (string) $v );
				}
			}
			return $out;
		};
		$props = $clean( $props_raw );
		$token = $props['_design_token'] ?? '';
		if ( ! preg_match( '/^[a-zA-Z0-9_]{8,80}$/', $token ) ) {
			wp_send_json_error( array( 'message' => 'design' ), 400 );
		}

		$added = 0;
		foreach ( array_slice( $items_raw, 0, 50 ) as $item ) {
			if ( ! is_array( $item ) ) {
				continue;
			}
			$p            = array_merge( $props, $clean( $item['properties'] ?? array() ) );
			$quantity     = max( 1, absint( $item['quantity'] ?? 1 ) );
			$variation_id = absint( $item['variantId'] ?? ( $item['id'] ?? 0 ) );
			$variation    = array();
			if ( $product->is_type( 'variable' ) ) {
				$var = wc_get_product( $variation_id );
				if ( ! $var || $var->get_parent_id() !== $product_id ) {
					continue;
				}
				$variation = wc_get_product_variation_attributes( $variation_id );
			} else {
				$variation_id = 0;
			}
			if ( ! empty( $item['size'] ) ) {
				$p['_pl_size'] = sanitize_text_field( (string) $item['size'] );
			}
			$extra = array();
			foreach ( self::DESIGNER_KEYS as $k ) {
				if ( isset( $p[ $k ] ) && '' !== $p[ $k ] ) {
					$extra[ 'printlab' . $k ] = $p[ $k ];
				}
			}
			$data = array(
				'printlab' => array(
					'token'   => $token,
					'preview' => esc_url_raw( $p['_front_preview_url'] ?? '' ),
					'extra'   => $extra,
					'display' => array(),
				),
			);
			if ( WC()->cart->add_to_cart( $product_id, $quantity, $variation_id, $variation, $data ) ) {
				++$added;
			}
		}
		if ( ! $added ) {
			wp_send_json_error( array( 'message' => 'cart' ), 400 );
		}
		wp_send_json_success( array( 'cartUrl' => wc_get_cart_url() ) );
	}

	// ── Fiyat ──────────────────────────────────────────────────────────────

	/** Tasarımın ek ücreti; PrintLab'in kaydettiği tutar (önbellek 10 dk). null = alınamadı */
	private function fee_for( $token, $quantity = 1 ) {
		$quantity  = max( 1, (int) $quantity );
		$cache_key = 'printlab_fee_' . md5( $token . '|' . $quantity );
		$cached    = get_transient( $cache_key );
		if ( false !== $cached ) {
			return (float) $cached;
		}
		$url = self::app_url( '/api/woo/quote?shop=' . rawurlencode( self::shop_key() ) . '&token=' . rawurlencode( $token ) . '&qty=' . $quantity );
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
		$qty = $this->token_quantities( $cart );
		foreach ( $cart->get_cart() as $key => $item ) {
			if ( empty( $item['printlab']['token'] ) ) {
				continue;
			}
			$token = $item['printlab']['token'];
			$fee   = $this->fee_for( $token, $qty[ $token ] ?? 1 );
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

	/** Toplu indirim için: aynı tasarımın sepetteki toplam adedi (tüm bedenler) */
	private function token_quantities( $cart ) {
		$qty = array();
		foreach ( $cart->get_cart() as $item ) {
			$token = $item['printlab']['token'] ?? '';
			if ( $token ) {
				$qty[ $token ] = ( $qty[ $token ] ?? 0 ) + (int) $item['quantity'];
			}
		}
		return $qty;
	}

	/** Ücreti doğrulanamayan tasarım ödemeye geçemez (eksik fiyatla satış olmasın) */
	public function check_cart_items() {
		$qty = $this->token_quantities( WC()->cart );
		foreach ( WC()->cart->get_cart() as $item ) {
			$token = $item['printlab']['token'] ?? '';
			if ( $token && null === $this->fee_for( $token, $qty[ $token ] ?? 1 ) ) {
				wc_add_notice( __( 'The price of a personalized item could not be confirmed. Please try again in a moment or save your design again.', 'printlab-for-woocommerce' ), 'error' );
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
			$data[] = array( 'key' => __( 'Personalization', 'printlab-for-woocommerce' ), 'value' => wp_strip_all_tags( wc_price( $fee ) ) );
		}
		return $data;
	}

	public function cart_item_thumbnail( $thumb, $item ) {
		if ( ! empty( $item['printlab']['preview'] ) ) {
			return '<img src="' . esc_url( $item['printlab']['preview'] ) . '" alt="" style="max-width:100%;height:auto" />';
		}
		return $thumb;
	}

	/** Blok sepet ve ödeme: ürün görseli yerine tasarımın önizlemesi */
	public function block_cart_images( $images, $item ) {
		$preview = $item['printlab']['preview'] ?? '';
		if ( ! $preview ) {
			return $images;
		}
		return array(
			(object) array(
				'id'        => 0,
				'src'       => $preview,
				'thumbnail' => $preview,
				'srcset'    => '',
				'sizes'     => '',
				'name'      => '',
				'alt'       => '',
			),
		);
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
		foreach ( (array) ( $p['extra'] ?? array() ) as $k => $v ) {
			if ( in_array( $k, self::LINE_KEYS, true ) ) {
				$item->add_meta_data( $k, $v, true );
			}
		}
		foreach ( (array) ( $p['display'] ?? array() ) as $k => $v ) {
			$item->add_meta_data( $k, $v, true );
		}
	}

	/**
	 * Müşterinin gördüğü yerler (sipariş alındı sayfası, e-postalar, hesabım,
	 * blok onay sayfası): PrintLab'in iç alanları gösterilmez. Yönetim
	 * ekranındaki gizleme (hidden_itemmeta) bunları kapsamıyor.
	 */
	public function hide_formatted_meta( $formatted ) {
		foreach ( (array) $formatted as $id => $meta ) {
			if ( isset( $meta->key ) && 0 === strpos( (string) $meta->key, 'printlab_' ) ) {
				unset( $formatted[ $id ] );
			}
		}
		return $formatted;
	}

	public function hidden_itemmeta( $keys ) {
		return array_merge( $keys, self::LINE_KEYS );
	}
}
