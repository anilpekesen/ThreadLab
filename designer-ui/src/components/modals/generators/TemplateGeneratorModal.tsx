import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import type { GeneratorKind, GeneratorModalProps } from './types';

const MODALS: Record<GeneratorKind, LazyExoticComponent<ComponentType<GeneratorModalProps>>> = {
  song: lazy(() => import('./SongModal')),
  monogram: lazy(() => import('./MonogramModal')),
  starmap: lazy(() => import('./StarmapModal')),
  citymap: lazy(() => import('./CitymapModal')),
  birthflower: lazy(() => import('./BirthflowerModal')),
};

/** Şablonun üretici türüne göre ilgili pencereyi açar */
export default function TemplateGeneratorModal(props: GeneratorModalProps) {
  const Modal = MODALS[props.assets.generatorKind];
  if (!Modal) return null;
  return (
    <Suspense fallback={null}>
      <Modal {...props} />
    </Suspense>
  );
}
