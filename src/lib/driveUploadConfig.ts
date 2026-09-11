/**
 * Sdílené mezi klientem (DriveFilesPanel) a serverem (driveActions) — žádné
 * server-only importy, aby to šlo bezpečně bundlovat i do "use client" kódu.
 *
 * Soubory pod hranicí jdou jako multipart přes naši server action (jednoduché,
 * ale limitované `serverActions.bodySizeLimit` v next.config.ts). Soubory nad
 * hranicí jdou resumable uploadem přímo z prohlížeče na Google Drive — bajty
 * souboru nikdy neprojdou naším serverem, takže není limitovaný velikostí
 * requestu na server action ani funkčním timeoutem.
 */
export const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 4 * 1024 * 1024;
