/**
 * Material Symbols Icon Catalog
 *
 * A curated selection of Material Symbols icons organized by category.
 * Full catalog has ~2500 icons - this is a representative selection.
 */

export interface MaterialIconDef {
  name: string
  label: string
  category: string
  keywords?: string[]
}

export const MATERIAL_ICONS: MaterialIconDef[] = [
  // Action
  { name: 'search', label: 'Search', category: 'action', keywords: ['find', 'lookup'] },
  { name: 'home', label: 'Home', category: 'action', keywords: ['house', 'main'] },
  { name: 'settings', label: 'Settings', category: 'action', keywords: ['cog', 'preferences', 'gear'] },
  { name: 'info', label: 'Info', category: 'action', keywords: ['information', 'about'] },
  { name: 'help', label: 'Help', category: 'action', keywords: ['question', 'support'] },
  { name: 'delete', label: 'Delete', category: 'action', keywords: ['trash', 'remove', 'bin'] },
  { name: 'done', label: 'Done', category: 'action', keywords: ['check', 'complete', 'success'] },
  { name: 'check_circle', label: 'Check Circle', category: 'action', keywords: ['done', 'complete'] },
  { name: 'close', label: 'Close', category: 'action', keywords: ['x', 'cancel', 'dismiss'] },
  { name: 'cancel', label: 'Cancel', category: 'action', keywords: ['close', 'x'] },
  { name: 'add', label: 'Add', category: 'action', keywords: ['plus', 'new', 'create'] },
  { name: 'add_circle', label: 'Add Circle', category: 'action', keywords: ['plus', 'new'] },
  { name: 'remove', label: 'Remove', category: 'action', keywords: ['minus', 'subtract'] },
  { name: 'edit', label: 'Edit', category: 'action', keywords: ['pencil', 'modify', 'change'] },
  { name: 'refresh', label: 'Refresh', category: 'action', keywords: ['reload', 'sync'] },
  { name: 'more_vert', label: 'More Vertical', category: 'action', keywords: ['menu', 'options'] },
  { name: 'more_horiz', label: 'More Horizontal', category: 'action', keywords: ['menu', 'options'] },
  { name: 'open_in_new', label: 'Open in New', category: 'action', keywords: ['external', 'link'] },
  { name: 'launch', label: 'Launch', category: 'action', keywords: ['open', 'external'] },
  { name: 'visibility', label: 'Visibility', category: 'action', keywords: ['eye', 'show', 'view'] },
  { name: 'visibility_off', label: 'Visibility Off', category: 'action', keywords: ['hide', 'hidden'] },
  { name: 'lock', label: 'Lock', category: 'action', keywords: ['secure', 'protected'] },
  { name: 'lock_open', label: 'Lock Open', category: 'action', keywords: ['unlock', 'unlocked'] },
  { name: 'favorite', label: 'Favorite', category: 'action', keywords: ['heart', 'love', 'like'] },
  { name: 'star', label: 'Star', category: 'action', keywords: ['favorite', 'rate', 'rating'] },
  { name: 'bookmark', label: 'Bookmark', category: 'action', keywords: ['save', 'mark'] },
  { name: 'label', label: 'Label', category: 'action', keywords: ['tag', 'category'] },
  { name: 'filter_list', label: 'Filter List', category: 'action', keywords: ['filter', 'sort'] },
  { name: 'sort', label: 'Sort', category: 'action', keywords: ['order', 'arrange'] },

  // Alert
  { name: 'warning', label: 'Warning', category: 'alert', keywords: ['alert', 'caution', 'attention'] },
  { name: 'error', label: 'Error', category: 'alert', keywords: ['problem', 'issue', 'fail'] },
  { name: 'notification_important', label: 'Notification Important', category: 'alert', keywords: ['alert', 'bell'] },
  { name: 'report', label: 'Report', category: 'alert', keywords: ['flag', 'issue'] },
  { name: 'report_problem', label: 'Report Problem', category: 'alert', keywords: ['warning', 'issue'] },

  // Communication
  { name: 'email', label: 'Email', category: 'communication', keywords: ['mail', 'message', 'envelope'] },
  { name: 'chat', label: 'Chat', category: 'communication', keywords: ['message', 'talk', 'conversation'] },
  { name: 'chat_bubble', label: 'Chat Bubble', category: 'communication', keywords: ['message', 'comment'] },
  { name: 'forum', label: 'Forum', category: 'communication', keywords: ['discussion', 'community'] },
  { name: 'comment', label: 'Comment', category: 'communication', keywords: ['message', 'feedback'] },
  { name: 'call', label: 'Call', category: 'communication', keywords: ['phone', 'telephone'] },
  { name: 'phone', label: 'Phone', category: 'communication', keywords: ['call', 'telephone', 'mobile'] },
  { name: 'notifications', label: 'Notifications', category: 'communication', keywords: ['bell', 'alert'] },
  { name: 'send', label: 'Send', category: 'communication', keywords: ['submit', 'mail'] },
  { name: 'share', label: 'Share', category: 'communication', keywords: ['social', 'distribute'] },

  // Content
  { name: 'content_copy', label: 'Copy', category: 'content', keywords: ['duplicate', 'clone'] },
  { name: 'content_cut', label: 'Cut', category: 'content', keywords: ['scissors', 'remove'] },
  { name: 'content_paste', label: 'Paste', category: 'content', keywords: ['clipboard', 'insert'] },
  { name: 'save', label: 'Save', category: 'content', keywords: ['disk', 'store'] },
  { name: 'undo', label: 'Undo', category: 'content', keywords: ['back', 'revert'] },
  { name: 'redo', label: 'Redo', category: 'content', keywords: ['forward', 'repeat'] },
  { name: 'link', label: 'Link', category: 'content', keywords: ['chain', 'url', 'hyperlink'] },
  { name: 'link_off', label: 'Link Off', category: 'content', keywords: ['unlink', 'broken'] },
  { name: 'flag', label: 'Flag', category: 'content', keywords: ['mark', 'report'] },
  { name: 'add_box', label: 'Add Box', category: 'content', keywords: ['plus', 'new'] },

  // Device
  { name: 'computer', label: 'Computer', category: 'device', keywords: ['desktop', 'pc', 'monitor'] },
  { name: 'laptop', label: 'Laptop', category: 'device', keywords: ['notebook', 'portable'] },
  { name: 'smartphone', label: 'Smartphone', category: 'device', keywords: ['phone', 'mobile'] },
  { name: 'tablet', label: 'Tablet', category: 'device', keywords: ['ipad', 'device'] },
  { name: 'watch', label: 'Watch', category: 'device', keywords: ['smartwatch', 'time'] },
  { name: 'tv', label: 'TV', category: 'device', keywords: ['television', 'screen', 'monitor'] },
  { name: 'storage', label: 'Storage', category: 'device', keywords: ['disk', 'hard drive', 'hdd'] },
  { name: 'memory', label: 'Memory', category: 'device', keywords: ['ram', 'chip'] },
  { name: 'cloud', label: 'Cloud', category: 'device', keywords: ['storage', 'online', 'network'] },
  { name: 'cloud_upload', label: 'Cloud Upload', category: 'device', keywords: ['upload', 'sync'] },
  { name: 'cloud_download', label: 'Cloud Download', category: 'device', keywords: ['download', 'sync'] },

  // Editor
  { name: 'format_bold', label: 'Bold', category: 'editor', keywords: ['text', 'font', 'strong'] },
  { name: 'format_italic', label: 'Italic', category: 'editor', keywords: ['text', 'font', 'emphasis'] },
  { name: 'format_underlined', label: 'Underlined', category: 'editor', keywords: ['text', 'font'] },
  { name: 'format_list_bulleted', label: 'Bullet List', category: 'editor', keywords: ['list', 'ul'] },
  { name: 'format_list_numbered', label: 'Numbered List', category: 'editor', keywords: ['list', 'ol'] },
  { name: 'format_quote', label: 'Quote', category: 'editor', keywords: ['blockquote', 'cite'] },
  { name: 'code', label: 'Code', category: 'editor', keywords: ['programming', 'developer', 'brackets'] },
  { name: 'title', label: 'Title', category: 'editor', keywords: ['heading', 'header', 'h1'] },
  { name: 'text_fields', label: 'Text Fields', category: 'editor', keywords: ['input', 'text'] },
  { name: 'table_chart', label: 'Table Chart', category: 'editor', keywords: ['grid', 'spreadsheet'] },

  // File
  { name: 'folder', label: 'Folder', category: 'file', keywords: ['directory', 'container'] },
  { name: 'folder_open', label: 'Folder Open', category: 'file', keywords: ['directory', 'opened'] },
  { name: 'create_new_folder', label: 'New Folder', category: 'file', keywords: ['directory', 'add'] },
  { name: 'file_present', label: 'File', category: 'file', keywords: ['document', 'paper'] },
  { name: 'description', label: 'Description', category: 'file', keywords: ['document', 'file', 'text'] },
  { name: 'article', label: 'Article', category: 'file', keywords: ['document', 'text', 'news'] },
  { name: 'picture_as_pdf', label: 'PDF', category: 'file', keywords: ['document', 'adobe'] },
  { name: 'image', label: 'Image', category: 'file', keywords: ['picture', 'photo'] },
  { name: 'video_file', label: 'Video File', category: 'file', keywords: ['movie', 'film'] },
  { name: 'audio_file', label: 'Audio File', category: 'file', keywords: ['music', 'sound'] },
  { name: 'attach_file', label: 'Attach File', category: 'file', keywords: ['paperclip', 'attachment'] },
  { name: 'download', label: 'Download', category: 'file', keywords: ['save', 'get'] },
  { name: 'upload', label: 'Upload', category: 'file', keywords: ['send', 'put'] },
  { name: 'file_upload', label: 'File Upload', category: 'file', keywords: ['import', 'add'] },
  { name: 'file_download', label: 'File Download', category: 'file', keywords: ['export', 'save'] },

  // Navigation
  { name: 'arrow_back', label: 'Arrow Back', category: 'navigation', keywords: ['left', 'previous'] },
  { name: 'arrow_forward', label: 'Arrow Forward', category: 'navigation', keywords: ['right', 'next'] },
  { name: 'arrow_upward', label: 'Arrow Upward', category: 'navigation', keywords: ['up', 'top'] },
  { name: 'arrow_downward', label: 'Arrow Downward', category: 'navigation', keywords: ['down', 'bottom'] },
  { name: 'arrow_drop_down', label: 'Dropdown Arrow', category: 'navigation', keywords: ['expand', 'menu'] },
  { name: 'arrow_drop_up', label: 'Dropup Arrow', category: 'navigation', keywords: ['collapse', 'menu'] },
  { name: 'chevron_left', label: 'Chevron Left', category: 'navigation', keywords: ['arrow', 'previous'] },
  { name: 'chevron_right', label: 'Chevron Right', category: 'navigation', keywords: ['arrow', 'next'] },
  { name: 'expand_more', label: 'Expand More', category: 'navigation', keywords: ['down', 'open'] },
  { name: 'expand_less', label: 'Expand Less', category: 'navigation', keywords: ['up', 'close'] },
  { name: 'menu', label: 'Menu', category: 'navigation', keywords: ['hamburger', 'nav'] },
  { name: 'apps', label: 'Apps', category: 'navigation', keywords: ['grid', 'launcher'] },
  { name: 'fullscreen', label: 'Fullscreen', category: 'navigation', keywords: ['expand', 'maximize'] },
  { name: 'fullscreen_exit', label: 'Exit Fullscreen', category: 'navigation', keywords: ['minimize', 'restore'] },

  // People
  { name: 'person', label: 'Person', category: 'people', keywords: ['user', 'account', 'profile'] },
  { name: 'people', label: 'People', category: 'people', keywords: ['users', 'group', 'team'] },
  { name: 'group', label: 'Group', category: 'people', keywords: ['team', 'people', 'users'] },
  { name: 'person_add', label: 'Add Person', category: 'people', keywords: ['user', 'new', 'invite'] },
  { name: 'person_remove', label: 'Remove Person', category: 'people', keywords: ['user', 'delete'] },
  { name: 'account_circle', label: 'Account Circle', category: 'people', keywords: ['user', 'profile', 'avatar'] },
  { name: 'face', label: 'Face', category: 'people', keywords: ['emoji', 'user'] },
  { name: 'admin_panel_settings', label: 'Admin', category: 'people', keywords: ['administrator', 'settings'] },
  { name: 'manage_accounts', label: 'Manage Accounts', category: 'people', keywords: ['users', 'settings'] },
  { name: 'badge', label: 'Badge', category: 'people', keywords: ['id', 'employee'] },

  // Places
  { name: 'location_on', label: 'Location', category: 'places', keywords: ['pin', 'map', 'marker'] },
  { name: 'place', label: 'Place', category: 'places', keywords: ['location', 'marker'] },
  { name: 'map', label: 'Map', category: 'places', keywords: ['location', 'directions'] },
  { name: 'public', label: 'Globe', category: 'places', keywords: ['world', 'earth', 'internet'] },
  { name: 'business', label: 'Business', category: 'places', keywords: ['building', 'office', 'company'] },
  { name: 'apartment', label: 'Apartment', category: 'places', keywords: ['building', 'home'] },
  { name: 'store', label: 'Store', category: 'places', keywords: ['shop', 'retail'] },
  { name: 'school', label: 'School', category: 'places', keywords: ['education', 'university'] },
  { name: 'local_hospital', label: 'Hospital', category: 'places', keywords: ['medical', 'health'] },

  // Social
  { name: 'thumb_up', label: 'Thumb Up', category: 'social', keywords: ['like', 'approve', 'positive'] },
  { name: 'thumb_down', label: 'Thumb Down', category: 'social', keywords: ['dislike', 'disapprove'] },
  { name: 'emoji_emotions', label: 'Emoji', category: 'social', keywords: ['smiley', 'face', 'reaction'] },
  { name: 'mood', label: 'Mood', category: 'social', keywords: ['face', 'happy'] },
  { name: 'sentiment_satisfied', label: 'Satisfied', category: 'social', keywords: ['happy', 'smile'] },
  { name: 'sentiment_dissatisfied', label: 'Dissatisfied', category: 'social', keywords: ['sad', 'unhappy'] },

  // Toggle
  { name: 'check_box', label: 'Checkbox', category: 'toggle', keywords: ['checked', 'selected'] },
  { name: 'check_box_outline_blank', label: 'Checkbox Empty', category: 'toggle', keywords: ['unchecked'] },
  { name: 'radio_button_checked', label: 'Radio Checked', category: 'toggle', keywords: ['selected'] },
  { name: 'radio_button_unchecked', label: 'Radio Unchecked', category: 'toggle', keywords: ['empty'] },
  { name: 'toggle_on', label: 'Toggle On', category: 'toggle', keywords: ['switch', 'enabled'] },
  { name: 'toggle_off', label: 'Toggle Off', category: 'toggle', keywords: ['switch', 'disabled'] },

  // Development
  { name: 'data_object', label: 'Data Object', category: 'development', keywords: ['json', 'object', 'data'] },
  { name: 'data_array', label: 'Data Array', category: 'development', keywords: ['list', 'array', 'data'] },
  { name: 'terminal', label: 'Terminal', category: 'development', keywords: ['console', 'command', 'shell'] },
  { name: 'bug_report', label: 'Bug Report', category: 'development', keywords: ['issue', 'error', 'debug'] },
  { name: 'integration_instructions', label: 'Integration', category: 'development', keywords: ['code', 'api'] },
  { name: 'api', label: 'API', category: 'development', keywords: ['interface', 'endpoint'] },
  { name: 'extension', label: 'Extension', category: 'development', keywords: ['plugin', 'addon'] },
  { name: 'developer_mode', label: 'Developer Mode', category: 'development', keywords: ['debug', 'development'] },
  { name: 'build', label: 'Build', category: 'development', keywords: ['compile', 'make'] },
  { name: 'settings_applications', label: 'App Settings', category: 'development', keywords: ['config', 'preferences'] },

  // Data / Analytics
  { name: 'analytics', label: 'Analytics', category: 'data', keywords: ['chart', 'statistics', 'metrics'] },
  { name: 'bar_chart', label: 'Bar Chart', category: 'data', keywords: ['graph', 'statistics'] },
  { name: 'pie_chart', label: 'Pie Chart', category: 'data', keywords: ['graph', 'statistics'] },
  { name: 'show_chart', label: 'Line Chart', category: 'data', keywords: ['graph', 'trend'] },
  { name: 'timeline', label: 'Timeline', category: 'data', keywords: ['history', 'events'] },
  { name: 'insights', label: 'Insights', category: 'data', keywords: ['analytics', 'lightbulb'] },
  { name: 'trending_up', label: 'Trending Up', category: 'data', keywords: ['growth', 'increase'] },
  { name: 'trending_down', label: 'Trending Down', category: 'data', keywords: ['decline', 'decrease'] },
  { name: 'database', label: 'Database', category: 'data', keywords: ['storage', 'data'] },

  // Security
  { name: 'security', label: 'Security', category: 'security', keywords: ['shield', 'protection'] },
  { name: 'verified_user', label: 'Verified User', category: 'security', keywords: ['shield', 'check'] },
  { name: 'gpp_good', label: 'Protection Good', category: 'security', keywords: ['shield', 'safe'] },
  { name: 'gpp_bad', label: 'Protection Bad', category: 'security', keywords: ['shield', 'warning'] },
  { name: 'key', label: 'Key', category: 'security', keywords: ['password', 'access'] },
  { name: 'vpn_key', label: 'VPN Key', category: 'security', keywords: ['password', 'secure'] },
  { name: 'password', label: 'Password', category: 'security', keywords: ['key', 'access'] },
  { name: 'fingerprint', label: 'Fingerprint', category: 'security', keywords: ['biometric', 'auth'] },

  // Business
  { name: 'work', label: 'Work', category: 'business', keywords: ['briefcase', 'job', 'career'] },
  { name: 'attach_money', label: 'Money', category: 'business', keywords: ['dollar', 'currency', 'finance'] },
  { name: 'payments', label: 'Payments', category: 'business', keywords: ['money', 'transaction'] },
  { name: 'receipt_long', label: 'Receipt', category: 'business', keywords: ['invoice', 'bill'] },
  { name: 'shopping_cart', label: 'Shopping Cart', category: 'business', keywords: ['buy', 'purchase'] },
  { name: 'shopping_bag', label: 'Shopping Bag', category: 'business', keywords: ['buy', 'retail'] },
  { name: 'inventory', label: 'Inventory', category: 'business', keywords: ['stock', 'warehouse'] },
  { name: 'assignment', label: 'Assignment', category: 'business', keywords: ['task', 'todo', 'clipboard'] },
  { name: 'task', label: 'Task', category: 'business', keywords: ['todo', 'checklist'] },
  { name: 'event', label: 'Event', category: 'business', keywords: ['calendar', 'schedule'] },
  { name: 'schedule', label: 'Schedule', category: 'business', keywords: ['clock', 'time', 'calendar'] },

  // Misc
  { name: 'lightbulb', label: 'Lightbulb', category: 'misc', keywords: ['idea', 'suggestion', 'tip'] },
  { name: 'electric_bolt', label: 'Electric Bolt', category: 'misc', keywords: ['lightning', 'power', 'energy'] },
  { name: 'light_mode', label: 'Light Mode', category: 'misc', keywords: ['sun', 'day', 'bright'] },
  { name: 'dark_mode', label: 'Dark Mode', category: 'misc', keywords: ['moon', 'night'] },
  { name: 'auto_awesome', label: 'Auto Awesome', category: 'misc', keywords: ['magic', 'sparkle', 'ai'] },
  { name: 'rocket_launch', label: 'Rocket', category: 'misc', keywords: ['launch', 'start', 'speed'] },
  { name: 'emoji_objects', label: 'Lightbulb Emoji', category: 'misc', keywords: ['idea', 'bulb'] },
  { name: 'token', label: 'Token', category: 'misc', keywords: ['nft', 'digital'] },
  { name: 'category', label: 'Category', category: 'misc', keywords: ['group', 'classify'] },
  { name: 'widgets', label: 'Widgets', category: 'misc', keywords: ['components', 'blocks'] },
  { name: 'view_in_ar', label: 'View in AR', category: 'misc', keywords: ['3d', 'cube'] },
  { name: 'workspace_premium', label: 'Premium', category: 'misc', keywords: ['badge', 'crown', 'vip'] },
  { name: 'verified', label: 'Verified', category: 'misc', keywords: ['check', 'badge', 'approved'] },
  { name: 'grade', label: 'Grade', category: 'misc', keywords: ['star', 'rating'] }
]

/**
 * Get all categories from icons
 */
export function getMaterialCategories(): string[] {
  const categories = new Set<string>()
  for (const icon of MATERIAL_ICONS) {
    categories.add(icon.category)
  }
  return Array.from(categories).sort()
}
