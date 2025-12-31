import type { Schema, Struct } from '@strapi/strapi';

export interface ContentImageBlock extends Struct.ComponentSchema {
  collectionName: 'components_content_image_blocks';
  info: {
    description: 'Single image with position control and optional pairing (SCEAR-style)';
    displayName: 'Image Block';
    icon: 'image';
  };
  attributes: {
    alt: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 255;
      }>;
    aspectRatio: Schema.Attribute.Enumeration<
      ['3:2', '16:9', '4:3', '1:1', '2:3', '9:16', '3:4', 'auto']
    > &
      Schema.Attribute.DefaultTo<'auto'>;
    caption: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 500;
      }>;
    image: Schema.Attribute.Media<'images'> & Schema.Attribute.Required;
    layout: Schema.Attribute.Enumeration<
      [
        'full-width',
        'left-float',
        'right-float',
        'center',
        'side-by-side',
        'breakout',
      ]
    > &
      Schema.Attribute.DefaultTo<'full-width'>;
    objectPosition: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 50;
      }> &
      Schema.Attribute.DefaultTo<'center center'>;
    pairWithNext: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    position: Schema.Attribute.Enumeration<
      ['left', 'right', 'center', 'full']
    > &
      Schema.Attribute.DefaultTo<'center'>;
    rounded: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    secondImage: Schema.Attribute.Media<'images'>;
    shadow: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    showCaption: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    size: Schema.Attribute.Enumeration<['small', 'medium', 'large']> &
      Schema.Attribute.DefaultTo<'medium'>;
    width: Schema.Attribute.Enumeration<['30', '40', '50', '60', '100']> &
      Schema.Attribute.DefaultTo<'50'>;
  };
}

export interface ContentImageGallery extends Struct.ComponentSchema {
  collectionName: 'components_content_image_galleries';
  info: {
    description: 'Multiple images in a gallery';
    displayName: 'Image Gallery';
    icon: 'images';
  };
  attributes: {
    columns: Schema.Attribute.Enumeration<['2', '3', '4']> &
      Schema.Attribute.DefaultTo<'3'>;
    images: Schema.Attribute.Media<'images', true> & Schema.Attribute.Required;
  };
}

export interface ContentQuoteBlock extends Struct.ComponentSchema {
  collectionName: 'components_content_quote_blocks';
  info: {
    description: 'Quote or poem with attribution';
    displayName: 'Quote Block';
    icon: 'quote';
  };
  attributes: {
    author: Schema.Attribute.String;
    source: Schema.Attribute.String;
    text: Schema.Attribute.Text & Schema.Attribute.Required;
  };
}

export interface ContentRichText extends Struct.ComponentSchema {
  collectionName: 'components_content_rich_texts';
  info: {
    description: 'Text content block';
    displayName: 'Rich Text';
    icon: 'file-text';
  };
  attributes: {
    body: Schema.Attribute.Blocks;
  };
}

export interface SharedQuote extends Struct.ComponentSchema {
  collectionName: 'components_shared_quotes';
  info: {
    description: 'Historical or poetic quote with attribution';
    displayName: 'Quote';
    icon: 'quote';
  };
  attributes: {
    author: Schema.Attribute.String;
    source: Schema.Attribute.String;
    text: Schema.Attribute.Text & Schema.Attribute.Required;
  };
}

export interface SidebarKeyFact extends Struct.ComponentSchema {
  collectionName: 'components_sidebar_key_facts';
  info: {
    description: 'Jednotliv\u00FD fakt pre bo\u010Dn\u00FD panel';
    displayName: 'K\u013E\u00FA\u010Dov\u00FD fakt';
    icon: 'info-circle';
  };
  attributes: {
    icon: Schema.Attribute.Enumeration<
      [
        'calendar',
        'users',
        'map',
        'building',
        'crown',
        'sword',
        'shield',
        'scroll',
        'book',
        'star',
        'flag',
        'mountain',
        'tree',
        'water',
        'fire',
        'custom',
      ]
    > &
      Schema.Attribute.DefaultTo<'star'>;
    label: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 100;
      }>;
    value: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 255;
      }>;
  };
}

export interface SidebarLocation extends Struct.ComponentSchema {
  collectionName: 'components_sidebar_locations';
  info: {
    description: 'GPS koordin\u00E1ty a n\u00E1zov lokality pre mapu';
    displayName: 'Lokalita';
    icon: 'map-marker-alt';
  };
  attributes: {
    country: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 100;
      }> &
      Schema.Attribute.DefaultTo<'Slovensko'>;
    latitude: Schema.Attribute.Float &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          max: 90;
          min: -90;
        },
        number
      >;
    longitude: Schema.Attribute.Float &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          max: 180;
          min: -180;
        },
        number
      >;
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 255;
      }>;
    region: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 100;
      }>;
  };
}

export interface SidebarTimelineEvent extends Struct.ComponentSchema {
  collectionName: 'components_sidebar_timeline_events';
  info: {
    description: 'Udalos\u0165 na \u010Dasovej osi';
    displayName: 'Udalos\u0165 \u010Dasovej osi';
    icon: 'clock';
  };
  attributes: {
    description: Schema.Attribute.Text &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 500;
      }>;
    title: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 255;
      }>;
    type: Schema.Attribute.Enumeration<
      [
        'founding',
        'battle',
        'construction',
        'destruction',
        'discovery',
        'event',
        'era',
      ]
    > &
      Schema.Attribute.DefaultTo<'event'>;
    year: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 50;
      }>;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'content.image-block': ContentImageBlock;
      'content.image-gallery': ContentImageGallery;
      'content.quote-block': ContentQuoteBlock;
      'content.rich-text': ContentRichText;
      'shared.quote': SharedQuote;
      'sidebar.key-fact': SidebarKeyFact;
      'sidebar.location': SidebarLocation;
      'sidebar.timeline-event': SidebarTimelineEvent;
    }
  }
}
