import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useTranslate} from '@shopify/ui-extensions/preact';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const translate = useTranslate();
  const cartLine = shopify.target.value;
  const designUrl = getAttributeValue(cartLine?.attributes, '_design_detail_url')
    || getAttributeValue(cartLine?.attributes, 'Tasarım Detayı')
    || getAttributeValue(cartLine?.attributes, 'Design details')
    || getAttributeValue(cartLine?.attributes, 'Customer Design Link');

  if (!designUrl) return null;

  return (
    <s-box paddingBlockStart="small">
      <s-link href={designUrl}>{translate('designDetails')}</s-link>
    </s-box>
  );
}

function getAttributeValue(attributes, key) {
  return attributes?.find((attribute) => attribute.key === key)?.value || '';
}
