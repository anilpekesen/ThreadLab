import '@shopify/ui-extensions/preact';
import {render} from 'preact';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const cartLine = shopify.target.value;
  const language = shopify.localization?.language?.current?.isoCode || '';
  const isTurkish = String(language).toLowerCase().startsWith('tr');
  const designUrl = getAttributeValue(cartLine?.attributes, '_design_detail_url')
    || getAttributeValue(cartLine?.attributes, 'Tasarım Detayı')
    || getAttributeValue(cartLine?.attributes, 'Design details')
    || getAttributeValue(cartLine?.attributes, 'Customer Design Link');

  if (!designUrl) return null;

  return (
    <s-box paddingBlockStart="small">
      <s-link href={designUrl}>{isTurkish ? 'Müşteri Tasarım Linki' : 'Customer Design Link'}</s-link>
    </s-box>
  );
}

function getAttributeValue(attributes, key) {
  return attributes?.find((attribute) => attribute.key === key)?.value || '';
}
