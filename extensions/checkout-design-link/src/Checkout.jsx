import '@shopify/ui-extensions/preact';
import {render} from 'preact';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const cartLine = shopify.target.value;
  const designUrl = getAttributeValue(cartLine?.attributes, '_design_detail_url')
    || getAttributeValue(cartLine?.attributes, 'Tasarım Detayı');

  if (!designUrl) return null;

  return (
    <s-box paddingBlockStart="small">
      <s-link href={designUrl}>Tasarım Detayı</s-link>
    </s-box>
  );
}

function getAttributeValue(attributes, key) {
  return attributes?.find((attribute) => attribute.key === key)?.value || '';
}
