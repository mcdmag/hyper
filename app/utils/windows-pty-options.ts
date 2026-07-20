import type {IWindowsPtyForkOptions} from 'node-pty';

type WindowsPtyOptions = Pick<IWindowsPtyForkOptions, 'useConpty' | 'useConptyDll'>;

export default function getWindowsPtyOptions(
  platform: NodeJS.Platform,
  useConpty?: boolean,
  useConptyDll?: boolean
): WindowsPtyOptions {
  if (platform !== 'win32') {
    return {};
  }

  if (useConpty === false) {
    return {useConpty: false};
  }

  return {
    ...(useConpty === true && {useConpty: true}),
    useConptyDll: useConptyDll !== false
  };
}
