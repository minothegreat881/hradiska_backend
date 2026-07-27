/**
 * Notifikačný engine — jediné miesto, kde notifikácie vznikajú.
 *
 * `notify()` volajú lifecycle hooky (komentár/odpoveď, reakcia/lajk, aktualita) a
 * moderácia (upozornenie). Rieši:
 *   - neupozorniť sám seba (actor === recipient),
 *   - rešpektovať predvoľby člena (notifyReply/Like/Post); `warning` sa doručuje vždy,
 *   - agregovať lajky na ten istý komentár v okne 1 h („3 čitatelia ocenili…"),
 *   - best-effort Web Push (ak je modul push-subscription k dispozícii).
 */
const UID = 'api::notification.notification';
const USER = 'plugin::users-permissions.user';

const PREF: Record<string, string> = {
  reply: 'notifyReply',
  like: 'notifyLike',
  post: 'notifyPost',
  // warning zámerne chýba — upozornenia správcu sa doručujú vždy
};

export default ({ strapi }: { strapi: any }) => ({
  async notify(input: {
    type: 'reply' | 'like' | 'warning' | 'post';
    recipientId: number;
    actorId?: number | null;
    postId?: number | null;
    commentId?: number | null;
    photoCommentId?: number | null;
    fileId?: number | null;
    aktualitaId?: number | null;
    text?: string | null;
  }) {
    const { type, recipientId } = input;
    if (!recipientId) return null;
    if (input.actorId && input.actorId === recipientId) return null; // neupozorňuj seba

    const recipient = await strapi.documents(USER).findFirst({
      filters: { id: recipientId },
      fields: ['id', 'blocked', 'notifyReply', 'notifyLike', 'notifyPost'],
    });
    if (!recipient || recipient.blocked) return null;
    const prefKey = PREF[type];
    if (prefKey && recipient[prefKey] === false) return null; // člen si daný typ vypol

    // Agregácia lajkov: rovnaký príjemca + (blog alebo foto) komentár, neprečítané,
    // do 1 h → navýš počet namiesto ďalšej notifikácie.
    if (type === 'like' && (input.commentId || input.photoCommentId)) {
      const since = new Date(Date.now() - 3600_000).toISOString();
      const key: any = input.photoCommentId
        ? { photoComment: { id: input.photoCommentId } }
        : { comment: { id: input.commentId } };
      const existing = await strapi.documents(UID).findMany({
        filters: {
          recipient: { id: recipientId }, type: 'like', read: false,
          ...key, createdAt: { $gt: since },
        } as any,
        sort: { createdAt: 'desc' }, pagination: { pageSize: 1 },
      });
      if (existing[0]) {
        const updated = await strapi.documents(UID).update({
          documentId: existing[0].documentId,
          data: { aggregateCount: (existing[0].aggregateCount || 1) + 1, actor: input.actorId || null } as any,
        });
        await this.pushSafe(recipientId, type, updated, input);
        return updated;
      }
    }

    const created = await strapi.documents(UID).create({
      data: {
        type, read: false, text: input.text ?? null,
        recipient: recipientId,
        actor: input.actorId || null,
        post: input.postId || null,
        comment: input.commentId || null,
        photoComment: input.photoCommentId || null,
        fileId: input.fileId || null,
        aktualita: input.aktualitaId || null,
      } as any,
    });
    await this.pushSafe(recipientId, type, created, input);
    return created;
  },

  /**
   * Z fileId (fotka z galérie) dohľadá článok, ktorý ju obsahuje — aby foto-
   * notifikácia vedela nastaviť `post` a frontend odkázal rovno na fotku.
   */
  async postIdFromFile(fileId?: number | null): Promise<number | null> {
    if (!fileId) return null;
    try {
      const posts = await strapi.documents('api::blog-post.blog-post').findMany({
        filters: { gallery: { id: fileId } } as any,
        fields: ['id'],
        pagination: { pageSize: 1 } as any,
      });
      return (posts[0] as any)?.id ?? null;
    } catch { return null; }
  },

  /** Fan-out novej aktuality: upozorni všetkých členov s notifyPost !== false. */
  async notifyNewPost(aktualitaId: number, aktualitaTitle: string) {
    const members = await strapi.documents(USER).findMany({
      filters: { notifyPost: { $ne: false }, blocked: { $ne: true } } as any,
      fields: ['id'], pagination: { pageSize: 5000 },
    });
    for (const m of members) {
      await this.notify({ type: 'post', recipientId: m.id, aktualitaId, text: aktualitaTitle });
    }
    return members.length;
  },

  /** Best-effort push — nikdy nezhodí hlavný tok, ak push modul ešte nie je nasadený. */
  async pushSafe(recipientId: number, type: string, notif: any, input: any) {
    try {
      const push = strapi.service('api::push-subscription.push-subscription');
      if (push?.sendToUser) {
        await push.sendToUser(recipientId, { type, text: input.text, notifId: notif?.documentId });
      }
    } catch { /* push je voliteľný */ }
  },
});
