/**
 * PrimeIcons Provider
 *
 * Built-in icon provider for PrimeIcons.
 * PrimeIcons CSS is already loaded via PrimeVue.
 */

import type { IconProvider, IconDefinition } from '../iconProviders'

/**
 * PrimeIcons catalog organized by category
 */
const PRIME_ICONS: IconDefinition[] = [
  // Common
  { name: 'star', label: 'Star', category: 'common', keywords: ['favorite', 'rating', 'important'] },
  { name: 'star-fill', label: 'Star Fill', category: 'common', keywords: ['favorite', 'rating'] },
  { name: 'heart', label: 'Heart', category: 'common', keywords: ['love', 'like', 'favorite'] },
  { name: 'heart-fill', label: 'Heart Fill', category: 'common', keywords: ['love', 'like'] },
  { name: 'bookmark', label: 'Bookmark', category: 'common', keywords: ['save', 'mark'] },
  { name: 'bookmark-fill', label: 'Bookmark Fill', category: 'common', keywords: ['save', 'mark'] },
  { name: 'tag', label: 'Tag', category: 'common', keywords: ['label', 'category'] },
  { name: 'tags', label: 'Tags', category: 'common', keywords: ['labels', 'categories'] },
  { name: 'flag', label: 'Flag', category: 'common', keywords: ['mark', 'report'] },
  { name: 'flag-fill', label: 'Flag Fill', category: 'common', keywords: ['mark', 'report'] },
  { name: 'filter', label: 'Filter', category: 'common', keywords: ['funnel', 'sort'] },
  { name: 'filter-fill', label: 'Filter Fill', category: 'common', keywords: ['funnel', 'sort'] },
  { name: 'filter-slash', label: 'Filter Slash', category: 'common', keywords: ['clear', 'remove'] },
  { name: 'eye', label: 'Eye', category: 'common', keywords: ['view', 'visible', 'show'] },
  { name: 'eye-slash', label: 'Eye Slash', category: 'common', keywords: ['hide', 'invisible'] },
  { name: 'verified', label: 'Verified', category: 'common', keywords: ['check', 'approved'] },

  // Shapes
  { name: 'circle', label: 'Circle', category: 'shapes', keywords: ['dot', 'point'] },
  { name: 'circle-fill', label: 'Circle Fill', category: 'shapes', keywords: ['dot', 'point'] },
  { name: 'check-circle', label: 'Check Circle', category: 'shapes', keywords: ['success', 'done'] },
  { name: 'times-circle', label: 'Times Circle', category: 'shapes', keywords: ['error', 'close'] },
  { name: 'info-circle', label: 'Info Circle', category: 'shapes', keywords: ['information', 'help'] },
  { name: 'exclamation-circle', label: 'Exclamation Circle', category: 'shapes', keywords: ['warning', 'alert'] },
  { name: 'question-circle', label: 'Question Circle', category: 'shapes', keywords: ['help', 'faq'] },
  { name: 'minus-circle', label: 'Minus Circle', category: 'shapes', keywords: ['remove', 'subtract'] },
  { name: 'plus-circle', label: 'Plus Circle', category: 'shapes', keywords: ['add', 'new'] },
  { name: 'stop-circle', label: 'Stop Circle', category: 'shapes', keywords: ['halt', 'block'] },
  { name: 'exclamation-triangle', label: 'Exclamation Triangle', category: 'shapes', keywords: ['warning', 'caution'] },

  // Navigation
  { name: 'home', label: 'Home', category: 'navigation', keywords: ['house', 'main', 'start'] },
  { name: 'arrow-up', label: 'Arrow Up', category: 'navigation', keywords: ['up', 'top'] },
  { name: 'arrow-down', label: 'Arrow Down', category: 'navigation', keywords: ['down', 'bottom'] },
  { name: 'arrow-left', label: 'Arrow Left', category: 'navigation', keywords: ['back', 'previous'] },
  { name: 'arrow-right', label: 'Arrow Right', category: 'navigation', keywords: ['forward', 'next'] },
  { name: 'arrow-up-right', label: 'Arrow Up Right', category: 'navigation', keywords: ['diagonal'] },
  { name: 'arrow-down-left', label: 'Arrow Down Left', category: 'navigation', keywords: ['diagonal'] },
  { name: 'arrows-h', label: 'Arrows H', category: 'navigation', keywords: ['horizontal', 'resize'] },
  { name: 'arrows-v', label: 'Arrows V', category: 'navigation', keywords: ['vertical', 'resize'] },
  { name: 'arrows-alt', label: 'Arrows Alt', category: 'navigation', keywords: ['move', 'drag'] },
  { name: 'angle-up', label: 'Angle Up', category: 'navigation', keywords: ['chevron', 'expand'] },
  { name: 'angle-down', label: 'Angle Down', category: 'navigation', keywords: ['chevron', 'collapse'] },
  { name: 'angle-left', label: 'Angle Left', category: 'navigation', keywords: ['chevron', 'back'] },
  { name: 'angle-right', label: 'Angle Right', category: 'navigation', keywords: ['chevron', 'forward'] },
  { name: 'angle-double-up', label: 'Angle Double Up', category: 'navigation', keywords: ['expand', 'top'] },
  { name: 'angle-double-down', label: 'Angle Double Down', category: 'navigation', keywords: ['collapse', 'bottom'] },
  { name: 'angle-double-left', label: 'Angle Double Left', category: 'navigation', keywords: ['first', 'start'] },
  { name: 'angle-double-right', label: 'Angle Double Right', category: 'navigation', keywords: ['last', 'end'] },
  { name: 'chevron-up', label: 'Chevron Up', category: 'navigation', keywords: ['expand'] },
  { name: 'chevron-down', label: 'Chevron Down', category: 'navigation', keywords: ['collapse'] },
  { name: 'chevron-left', label: 'Chevron Left', category: 'navigation', keywords: ['back'] },
  { name: 'chevron-right', label: 'Chevron Right', category: 'navigation', keywords: ['forward'] },
  { name: 'map', label: 'Map', category: 'navigation', keywords: ['location', 'geography'] },
  { name: 'map-marker', label: 'Map Marker', category: 'navigation', keywords: ['location', 'pin'] },
  { name: 'globe', label: 'Globe', category: 'navigation', keywords: ['world', 'earth', 'web'] },
  { name: 'compass', label: 'Compass', category: 'navigation', keywords: ['direction', 'navigation'] },
  { name: 'directions', label: 'Directions', category: 'navigation', keywords: ['route', 'path'] },
  { name: 'directions-alt', label: 'Directions Alt', category: 'navigation', keywords: ['route', 'path'] },
  { name: 'sort', label: 'Sort', category: 'navigation', keywords: ['order', 'arrange'] },
  { name: 'sort-alt', label: 'Sort Alt', category: 'navigation', keywords: ['order', 'arrange'] },
  { name: 'sort-alpha-down', label: 'Sort Alpha Down', category: 'navigation', keywords: ['alphabetical'] },
  { name: 'sort-alpha-up', label: 'Sort Alpha Up', category: 'navigation', keywords: ['alphabetical'] },
  { name: 'sort-amount-down', label: 'Sort Amount Down', category: 'navigation', keywords: ['numeric'] },
  { name: 'sort-amount-up', label: 'Sort Amount Up', category: 'navigation', keywords: ['numeric'] },
  { name: 'sort-numeric-down', label: 'Sort Numeric Down', category: 'navigation', keywords: ['numeric'] },
  { name: 'sort-numeric-up', label: 'Sort Numeric Up', category: 'navigation', keywords: ['numeric'] },

  // People
  { name: 'user', label: 'User', category: 'people', keywords: ['person', 'account', 'profile'] },
  { name: 'users', label: 'Users', category: 'people', keywords: ['people', 'group', 'team'] },
  { name: 'user-plus', label: 'User Plus', category: 'people', keywords: ['add', 'new user'] },
  { name: 'user-minus', label: 'User Minus', category: 'people', keywords: ['remove', 'delete user'] },
  { name: 'user-edit', label: 'User Edit', category: 'people', keywords: ['modify', 'update'] },
  { name: 'id-card', label: 'ID Card', category: 'people', keywords: ['identity', 'profile'] },

  // Objects
  { name: 'box', label: 'Box', category: 'objects', keywords: ['package', 'product', 'container'] },
  { name: 'building', label: 'Building', category: 'objects', keywords: ['company', 'office', 'business'] },
  { name: 'briefcase', label: 'Briefcase', category: 'objects', keywords: ['work', 'business', 'job'] },
  { name: 'car', label: 'Car', category: 'objects', keywords: ['vehicle', 'transport', 'auto'] },
  { name: 'truck', label: 'Truck', category: 'objects', keywords: ['delivery', 'shipping', 'transport'] },
  { name: 'gift', label: 'Gift', category: 'objects', keywords: ['present', 'reward', 'bonus'] },
  { name: 'wallet', label: 'Wallet', category: 'objects', keywords: ['money', 'payment', 'finance'] },
  { name: 'credit-card', label: 'Credit Card', category: 'objects', keywords: ['payment', 'money', 'bank'] },
  { name: 'money-bill', label: 'Money Bill', category: 'objects', keywords: ['cash', 'payment', 'finance'] },
  { name: 'shopping-cart', label: 'Shopping Cart', category: 'objects', keywords: ['cart', 'buy', 'store'] },
  { name: 'shopping-bag', label: 'Shopping Bag', category: 'objects', keywords: ['bag', 'buy', 'store'] },
  { name: 'ticket', label: 'Ticket', category: 'objects', keywords: ['coupon', 'voucher', 'pass'] },
  { name: 'receipt', label: 'Receipt', category: 'objects', keywords: ['invoice', 'bill', 'document'] },
  { name: 'warehouse', label: 'Warehouse', category: 'objects', keywords: ['storage', 'inventory', 'stock'] },
  { name: 'key', label: 'Key', category: 'objects', keywords: ['security', 'access', 'password'] },
  { name: 'lock', label: 'Lock', category: 'objects', keywords: ['security', 'private', 'protected'] },
  { name: 'lock-open', label: 'Lock Open', category: 'objects', keywords: ['unlock', 'open', 'accessible'] },
  { name: 'shield', label: 'Shield', category: 'objects', keywords: ['security', 'protection', 'safe'] },
  { name: 'crown', label: 'Crown', category: 'objects', keywords: ['king', 'premium', 'vip'] },
  { name: 'trophy', label: 'Trophy', category: 'objects', keywords: ['award', 'winner', 'achievement'] },
  { name: 'hammer', label: 'Hammer', category: 'objects', keywords: ['tool', 'build', 'construct'] },
  { name: 'wrench', label: 'Wrench', category: 'objects', keywords: ['tool', 'settings', 'repair'] },
  { name: 'palette', label: 'Palette', category: 'objects', keywords: ['color', 'design', 'art'] },
  { name: 'eraser', label: 'Eraser', category: 'objects', keywords: ['delete', 'remove', 'clear'] },
  { name: 'book', label: 'Book', category: 'objects', keywords: ['read', 'library', 'documentation'] },
  { name: 'calculator', label: 'Calculator', category: 'objects', keywords: ['math', 'compute', 'numbers'] },
  { name: 'bullseye', label: 'Bullseye', category: 'objects', keywords: ['target', 'goal', 'aim'] },
  { name: 'lightbulb', label: 'Lightbulb', category: 'objects', keywords: ['idea', 'tip', 'hint'] },
  { name: 'hourglass', label: 'Hourglass', category: 'objects', keywords: ['time', 'wait', 'loading'] },

  // Files
  { name: 'file', label: 'File', category: 'files', keywords: ['document', 'page'] },
  { name: 'file-edit', label: 'File Edit', category: 'files', keywords: ['document', 'modify'] },
  { name: 'file-pdf', label: 'File PDF', category: 'files', keywords: ['document', 'pdf'] },
  { name: 'file-excel', label: 'File Excel', category: 'files', keywords: ['spreadsheet', 'xls'] },
  { name: 'file-word', label: 'File Word', category: 'files', keywords: ['document', 'doc'] },
  { name: 'file-export', label: 'File Export', category: 'files', keywords: ['export', 'download'] },
  { name: 'file-import', label: 'File Import', category: 'files', keywords: ['import', 'upload'] },
  { name: 'folder', label: 'Folder', category: 'files', keywords: ['directory', 'container'] },
  { name: 'folder-open', label: 'Folder Open', category: 'files', keywords: ['directory', 'browse'] },
  { name: 'inbox', label: 'Inbox', category: 'files', keywords: ['mail', 'messages'] },
  { name: 'paperclip', label: 'Paperclip', category: 'files', keywords: ['attachment', 'attach'] },
  { name: 'image', label: 'Image', category: 'files', keywords: ['picture', 'photo', 'gallery'] },
  { name: 'images', label: 'Images', category: 'files', keywords: ['pictures', 'photos', 'gallery'] },
  { name: 'video', label: 'Video', category: 'files', keywords: ['movie', 'film', 'media'] },
  { name: 'camera', label: 'Camera', category: 'files', keywords: ['photo', 'picture', 'capture'] },

  // Data
  { name: 'list', label: 'List', category: 'data', keywords: ['items', 'menu', 'lines'] },
  { name: 'table', label: 'Table', category: 'data', keywords: ['grid', 'spreadsheet', 'data'] },
  { name: 'th-large', label: 'Th Large', category: 'data', keywords: ['grid', 'tiles', 'cards'] },
  { name: 'database', label: 'Database', category: 'data', keywords: ['storage', 'data', 'sql'] },
  { name: 'server', label: 'Server', category: 'data', keywords: ['computer', 'host', 'machine'] },
  { name: 'chart-bar', label: 'Chart Bar', category: 'data', keywords: ['graph', 'statistics', 'analytics'] },
  { name: 'chart-line', label: 'Chart Line', category: 'data', keywords: ['graph', 'trend', 'analytics'] },
  { name: 'chart-pie', label: 'Chart Pie', category: 'data', keywords: ['graph', 'percentage', 'analytics'] },
  { name: 'percentage', label: 'Percentage', category: 'data', keywords: ['percent', 'ratio', 'number'] },
  { name: 'hashtag', label: 'Hashtag', category: 'data', keywords: ['number', 'tag', 'topic'] },
  { name: 'at', label: 'At', category: 'data', keywords: ['email', 'mention', 'address'] },
  { name: 'objects-column', label: 'Objects Column', category: 'data', keywords: ['layout', 'columns'] },

  // Communication
  { name: 'envelope', label: 'Envelope', category: 'communication', keywords: ['email', 'mail', 'message'] },
  { name: 'send', label: 'Send', category: 'communication', keywords: ['email', 'submit', 'dispatch'] },
  { name: 'phone', label: 'Phone', category: 'communication', keywords: ['call', 'contact', 'telephone'] },
  { name: 'mobile', label: 'Mobile', category: 'communication', keywords: ['phone', 'smartphone', 'cell'] },
  { name: 'comment', label: 'Comment', category: 'communication', keywords: ['message', 'chat', 'feedback'] },
  { name: 'comments', label: 'Comments', category: 'communication', keywords: ['messages', 'chat', 'discussion'] },
  { name: 'bell', label: 'Bell', category: 'communication', keywords: ['notification', 'alert', 'alarm'] },
  { name: 'megaphone', label: 'Megaphone', category: 'communication', keywords: ['announce', 'broadcast', 'speaker'] },
  { name: 'discord', label: 'Discord', category: 'communication', keywords: ['chat', 'social'] },
  { name: 'slack', label: 'Slack', category: 'communication', keywords: ['chat', 'social'] },
  { name: 'whatsapp', label: 'WhatsApp', category: 'communication', keywords: ['chat', 'social'] },
  { name: 'telegram', label: 'Telegram', category: 'communication', keywords: ['chat', 'social'] },

  // Technology
  { name: 'cog', label: 'Cog', category: 'technology', keywords: ['settings', 'config', 'gear'] },
  { name: 'sliders-h', label: 'Sliders H', category: 'technology', keywords: ['settings', 'adjust', 'controls'] },
  { name: 'sliders-v', label: 'Sliders V', category: 'technology', keywords: ['settings', 'adjust', 'controls'] },
  { name: 'code', label: 'Code', category: 'technology', keywords: ['programming', 'development', 'html'] },
  { name: 'desktop', label: 'Desktop', category: 'technology', keywords: ['computer', 'monitor', 'screen'] },
  { name: 'tablet', label: 'Tablet', category: 'technology', keywords: ['device', 'ipad', 'screen'] },
  { name: 'wifi', label: 'Wifi', category: 'technology', keywords: ['wireless', 'internet', 'network'] },
  { name: 'bluetooth', label: 'Bluetooth', category: 'technology', keywords: ['wireless', 'connect'] },
  { name: 'microchip', label: 'Microchip', category: 'technology', keywords: ['cpu', 'processor', 'chip'] },
  { name: 'qrcode', label: 'QR Code', category: 'technology', keywords: ['scan', 'barcode'] },
  { name: 'sitemap', label: 'Sitemap', category: 'technology', keywords: ['structure', 'hierarchy', 'tree'] },
  { name: 'share-alt', label: 'Share Alt', category: 'technology', keywords: ['share', 'connect', 'network'] },
  { name: 'link', label: 'Link', category: 'technology', keywords: ['chain', 'url', 'connection'] },
  { name: 'external-link', label: 'External Link', category: 'technology', keywords: ['open', 'new window'] },
  { name: 'cloud', label: 'Cloud', category: 'technology', keywords: ['storage', 'upload', 'online'] },
  { name: 'cloud-upload', label: 'Cloud Upload', category: 'technology', keywords: ['upload', 'save'] },
  { name: 'cloud-download', label: 'Cloud Download', category: 'technology', keywords: ['download', 'get'] },
  { name: 'github', label: 'GitHub', category: 'technology', keywords: ['git', 'repository', 'code'] },
  { name: 'google', label: 'Google', category: 'technology', keywords: ['search', 'social'] },
  { name: 'microsoft', label: 'Microsoft', category: 'technology', keywords: ['windows', 'office'] },
  { name: 'apple', label: 'Apple', category: 'technology', keywords: ['mac', 'ios'] },
  { name: 'android', label: 'Android', category: 'technology', keywords: ['mobile', 'phone'] },
  { name: 'language', label: 'Language', category: 'technology', keywords: ['translate', 'i18n', 'localization'] },

  // Actions
  { name: 'plus', label: 'Plus', category: 'actions', keywords: ['add', 'new', 'create'] },
  { name: 'minus', label: 'Minus', category: 'actions', keywords: ['remove', 'subtract', 'delete'] },
  { name: 'check', label: 'Check', category: 'actions', keywords: ['done', 'confirm', 'approve'] },
  { name: 'times', label: 'Times', category: 'actions', keywords: ['close', 'cancel', 'remove'] },
  { name: 'search', label: 'Search', category: 'actions', keywords: ['find', 'lookup', 'magnify'] },
  { name: 'search-plus', label: 'Search Plus', category: 'actions', keywords: ['zoom in', 'magnify'] },
  { name: 'search-minus', label: 'Search Minus', category: 'actions', keywords: ['zoom out'] },
  { name: 'pencil', label: 'Pencil', category: 'actions', keywords: ['edit', 'write', 'modify'] },
  { name: 'trash', label: 'Trash', category: 'actions', keywords: ['delete', 'remove', 'bin'] },
  { name: 'copy', label: 'Copy', category: 'actions', keywords: ['duplicate', 'clone'] },
  { name: 'clone', label: 'Clone', category: 'actions', keywords: ['duplicate', 'copy'] },
  { name: 'sync', label: 'Sync', category: 'actions', keywords: ['refresh', 'update', 'synchronize'] },
  { name: 'refresh', label: 'Refresh', category: 'actions', keywords: ['reload', 'update'] },
  { name: 'undo', label: 'Undo', category: 'actions', keywords: ['revert', 'back', 'rollback'] },
  { name: 'replay', label: 'Replay', category: 'actions', keywords: ['repeat', 'redo', 'again'] },
  { name: 'download', label: 'Download', category: 'actions', keywords: ['save', 'get', 'export'] },
  { name: 'upload', label: 'Upload', category: 'actions', keywords: ['send', 'import'] },
  { name: 'print', label: 'Print', category: 'actions', keywords: ['printer', 'output'] },
  { name: 'save', label: 'Save', category: 'actions', keywords: ['floppy', 'store'] },
  { name: 'expand', label: 'Expand', category: 'actions', keywords: ['fullscreen', 'maximize'] },
  { name: 'compress', label: 'Compress', category: 'actions', keywords: ['minimize', 'shrink'] },
  { name: 'eject', label: 'Eject', category: 'actions', keywords: ['remove', 'output'] },
  { name: 'ban', label: 'Ban', category: 'actions', keywords: ['block', 'forbidden', 'disable'] },
  { name: 'power-off', label: 'Power Off', category: 'actions', keywords: ['shutdown', 'turn off'] },
  { name: 'sign-in', label: 'Sign In', category: 'actions', keywords: ['login', 'enter'] },
  { name: 'sign-out', label: 'Sign Out', category: 'actions', keywords: ['logout', 'exit'] },

  // Media
  { name: 'play', label: 'Play', category: 'media', keywords: ['start', 'begin', 'video'] },
  { name: 'pause', label: 'Pause', category: 'media', keywords: ['stop', 'hold'] },
  { name: 'stop', label: 'Stop', category: 'media', keywords: ['end', 'halt'] },
  { name: 'forward', label: 'Forward', category: 'media', keywords: ['next', 'skip'] },
  { name: 'backward', label: 'Backward', category: 'media', keywords: ['previous', 'rewind'] },
  { name: 'step-forward', label: 'Step Forward', category: 'media', keywords: ['next', 'skip'] },
  { name: 'step-backward', label: 'Step Backward', category: 'media', keywords: ['previous'] },
  { name: 'fast-forward', label: 'Fast Forward', category: 'media', keywords: ['skip', 'speed'] },
  { name: 'fast-backward', label: 'Fast Backward', category: 'media', keywords: ['rewind', 'speed'] },
  { name: 'volume-up', label: 'Volume Up', category: 'media', keywords: ['sound', 'audio', 'loud'] },
  { name: 'volume-down', label: 'Volume Down', category: 'media', keywords: ['sound', 'audio', 'quiet'] },
  { name: 'volume-off', label: 'Volume Off', category: 'media', keywords: ['mute', 'silent'] },
  { name: 'microphone', label: 'Microphone', category: 'media', keywords: ['audio', 'record', 'voice'] },
  { name: 'microphone-slash', label: 'Microphone Slash', category: 'media', keywords: ['mute'] },
  { name: 'headphones', label: 'Headphones', category: 'media', keywords: ['audio', 'listen', 'music'] },
  { name: 'wave-pulse', label: 'Wave Pulse', category: 'media', keywords: ['audio', 'sound', 'waveform'] },

  // Time
  { name: 'calendar', label: 'Calendar', category: 'time', keywords: ['date', 'schedule', 'event'] },
  { name: 'calendar-plus', label: 'Calendar Plus', category: 'time', keywords: ['add event', 'schedule'] },
  { name: 'calendar-minus', label: 'Calendar Minus', category: 'time', keywords: ['remove event'] },
  { name: 'calendar-times', label: 'Calendar Times', category: 'time', keywords: ['cancel event'] },
  { name: 'clock', label: 'Clock', category: 'time', keywords: ['time', 'watch', 'schedule'] },
  { name: 'history', label: 'History', category: 'time', keywords: ['past', 'log', 'activity'] },
  { name: 'stopwatch', label: 'Stopwatch', category: 'time', keywords: ['timer', 'speed', 'measure'] },

  // Weather
  { name: 'sun', label: 'Sun', category: 'weather', keywords: ['day', 'bright', 'light mode'] },
  { name: 'moon', label: 'Moon', category: 'weather', keywords: ['night', 'dark mode'] },
  { name: 'bolt', label: 'Bolt', category: 'weather', keywords: ['lightning', 'power', 'electric'] },
  { name: 'sparkles', label: 'Sparkles', category: 'weather', keywords: ['magic', 'new', 'ai'] },

  // Social
  { name: 'thumbs-up', label: 'Thumbs Up', category: 'social', keywords: ['like', 'approve', 'good'] },
  { name: 'thumbs-down', label: 'Thumbs Down', category: 'social', keywords: ['dislike', 'bad'] },
  { name: 'facebook', label: 'Facebook', category: 'social', keywords: ['social', 'network'] },
  { name: 'twitter', label: 'Twitter', category: 'social', keywords: ['social', 'network'] },
  { name: 'instagram', label: 'Instagram', category: 'social', keywords: ['social', 'network', 'photo'] },
  { name: 'linkedin', label: 'LinkedIn', category: 'social', keywords: ['social', 'network', 'professional'] },
  { name: 'youtube', label: 'YouTube', category: 'social', keywords: ['video', 'social'] },
  { name: 'vimeo', label: 'Vimeo', category: 'social', keywords: ['video', 'social'] },
  { name: 'twitch', label: 'Twitch', category: 'social', keywords: ['streaming', 'gaming'] },
  { name: 'reddit', label: 'Reddit', category: 'social', keywords: ['social', 'forum'] },
  { name: 'pinterest', label: 'Pinterest', category: 'social', keywords: ['social', 'images'] },
  { name: 'tiktok', label: 'TikTok', category: 'social', keywords: ['social', 'video'] },

  // UI
  { name: 'bars', label: 'Bars', category: 'ui', keywords: ['menu', 'hamburger', 'navigation'] },
  { name: 'ellipsis-h', label: 'Ellipsis H', category: 'ui', keywords: ['more', 'options', 'menu'] },
  { name: 'ellipsis-v', label: 'Ellipsis V', category: 'ui', keywords: ['more', 'options', 'menu'] },
  { name: 'grip-vertical', label: 'Grip Vertical', category: 'ui', keywords: ['drag', 'handle', 'move'] },
  { name: 'window-maximize', label: 'Window Maximize', category: 'ui', keywords: ['fullscreen', 'expand'] },
  { name: 'window-minimize', label: 'Window Minimize', category: 'ui', keywords: ['collapse', 'shrink'] },
  { name: 'spinner', label: 'Spinner', category: 'ui', keywords: ['loading', 'wait'] },
  { name: 'spin', label: 'Spin', category: 'ui', keywords: ['loading', 'rotate'] },
]

/**
 * Get all unique categories
 */
function getUniqueCategories(): string[] {
  const categories = new Set<string>()
  for (const icon of PRIME_ICONS) {
    categories.add(icon.category)
  }
  return Array.from(categories).sort()
}

/**
 * PrimeIcons provider implementation
 */
export class PrimeIconsProvider implements IconProvider {
  readonly id = 'primeicons'
  readonly name = 'PrimeIcons'
  readonly version = '7.0'

  private categories: string[] = getUniqueCategories()

  getIcons(): IconDefinition[] {
    return PRIME_ICONS
  }

  getCategories(): string[] {
    return this.categories
  }

  getIconsByCategory(category: string): IconDefinition[] {
    return PRIME_ICONS.filter(icon => icon.category === category)
  }

  searchIcons(query: string): IconDefinition[] {
    const q = query.toLowerCase().trim()
    if (!q) return PRIME_ICONS

    return PRIME_ICONS.filter(icon => {
      // Match name
      if (icon.name.toLowerCase().includes(q)) return true
      // Match label
      if (icon.label.toLowerCase().includes(q)) return true
      // Match keywords
      if (icon.keywords?.some(kw => kw.toLowerCase().includes(q))) return true
      // Match category
      if (icon.category.toLowerCase().includes(q)) return true
      return false
    })
  }

  resolveIconClass(iconName: string, _variant?: string): string {
    return `pi pi-${iconName}`
  }

  isLoaded(): boolean {
    // PrimeIcons are loaded via PrimeVue CSS
    return true
  }
}
