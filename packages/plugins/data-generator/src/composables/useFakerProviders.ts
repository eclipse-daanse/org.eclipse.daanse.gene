/**
 * FakerJS Provider Mappings
 *
 * Registers ~40 built-in FakerJS methods as generators
 * with EDataType compatibility mappings.
 */

import { faker } from '@faker-js/faker'
import type { GeneratorInfo } from '../types'
import { useGeneratorRegistry } from './useGeneratorRegistry'

/** EDataType names for compatibility matching */
const STRING = 'EString'
const INT = 'EInt'
const FLOAT = 'EFloat'
const DOUBLE = 'EDouble'
const BOOLEAN = 'EBoolean'
const DATE = 'EDate'
const LONG = 'ELong'
const SHORT = 'EShort'

/**
 * Built-in faker generators
 */
function createFakerGenerators(): GeneratorInfo[] {
  return [
    // --- Person ---
    {
      key: 'faker.person.firstName',
      label: 'First Name',
      category: 'Person',
      compatibleTypes: [STRING],
      generate: () => faker.person.firstName()
    },
    {
      key: 'faker.person.lastName',
      label: 'Last Name',
      category: 'Person',
      compatibleTypes: [STRING],
      generate: () => faker.person.lastName()
    },
    {
      key: 'faker.person.fullName',
      label: 'Full Name',
      category: 'Person',
      compatibleTypes: [STRING],
      generate: () => faker.person.fullName()
    },
    {
      key: 'faker.person.prefix',
      label: 'Name Prefix',
      category: 'Person',
      compatibleTypes: [STRING],
      generate: () => faker.person.prefix()
    },
    {
      key: 'faker.person.suffix',
      label: 'Name Suffix',
      category: 'Person',
      compatibleTypes: [STRING],
      generate: () => faker.person.suffix()
    },
    {
      key: 'faker.person.jobTitle',
      label: 'Job Title',
      category: 'Person',
      compatibleTypes: [STRING],
      generate: () => faker.person.jobTitle()
    },
    {
      key: 'faker.person.gender',
      label: 'Gender',
      category: 'Person',
      compatibleTypes: [STRING],
      generate: () => faker.person.gender()
    },

    // --- Internet ---
    {
      key: 'faker.internet.email',
      label: 'Email',
      category: 'Internet',
      compatibleTypes: [STRING],
      generate: () => faker.internet.email()
    },
    {
      key: 'faker.internet.username',
      label: 'Username',
      category: 'Internet',
      compatibleTypes: [STRING],
      generate: () => faker.internet.username()
    },
    {
      key: 'faker.internet.url',
      label: 'URL',
      category: 'Internet',
      compatibleTypes: [STRING],
      generate: () => faker.internet.url()
    },
    {
      key: 'faker.internet.ip',
      label: 'IP Address',
      category: 'Internet',
      compatibleTypes: [STRING],
      generate: () => faker.internet.ip()
    },
    {
      key: 'faker.internet.ipv6',
      label: 'IPv6 Address',
      category: 'Internet',
      compatibleTypes: [STRING],
      generate: () => faker.internet.ipv6()
    },

    // --- Company ---
    {
      key: 'faker.company.name',
      label: 'Company Name',
      category: 'Company',
      compatibleTypes: [STRING],
      generate: () => faker.company.name()
    },
    {
      key: 'faker.company.catchPhrase',
      label: 'Catch Phrase',
      category: 'Company',
      compatibleTypes: [STRING],
      generate: () => faker.company.catchPhrase()
    },
    {
      key: 'faker.company.buzzPhrase',
      label: 'Buzz Phrase',
      category: 'Company',
      compatibleTypes: [STRING],
      generate: () => faker.company.buzzPhrase()
    },

    // --- Location ---
    {
      key: 'faker.location.city',
      label: 'City',
      category: 'Location',
      compatibleTypes: [STRING],
      generate: () => faker.location.city()
    },
    {
      key: 'faker.location.country',
      label: 'Country',
      category: 'Location',
      compatibleTypes: [STRING],
      generate: () => faker.location.country()
    },
    {
      key: 'faker.location.street',
      label: 'Street',
      category: 'Location',
      compatibleTypes: [STRING],
      generate: () => faker.location.street()
    },
    {
      key: 'faker.location.zipCode',
      label: 'Zip Code',
      category: 'Location',
      compatibleTypes: [STRING],
      generate: () => faker.location.zipCode()
    },
    {
      key: 'faker.location.state',
      label: 'State',
      category: 'Location',
      compatibleTypes: [STRING],
      generate: () => faker.location.state()
    },

    // --- Lorem ---
    {
      key: 'faker.lorem.word',
      label: 'Word',
      category: 'Lorem',
      compatibleTypes: [STRING],
      generate: () => faker.lorem.word()
    },
    {
      key: 'faker.lorem.words',
      label: 'Words (3)',
      category: 'Lorem',
      compatibleTypes: [STRING],
      generate: (args) => faker.lorem.words(args?.count || 3)
    },
    {
      key: 'faker.lorem.sentence',
      label: 'Sentence',
      category: 'Lorem',
      compatibleTypes: [STRING],
      generate: () => faker.lorem.sentence()
    },
    {
      key: 'faker.lorem.paragraph',
      label: 'Paragraph',
      category: 'Lorem',
      compatibleTypes: [STRING],
      generate: () => faker.lorem.paragraph()
    },

    // --- Number ---
    {
      key: 'faker.number.int',
      label: 'Integer',
      category: 'Number',
      compatibleTypes: [INT, LONG, SHORT, STRING],
      argsSchema: { min: 'number', max: 'number' },
      generate: (args) => faker.number.int(args || { min: 0, max: 1000 })
    },
    {
      key: 'faker.number.float',
      label: 'Float',
      category: 'Number',
      compatibleTypes: [FLOAT, DOUBLE, STRING],
      argsSchema: { min: 'number', max: 'number', fractionDigits: 'number' },
      generate: (args) => faker.number.float(args || { min: 0, max: 1000, fractionDigits: 2 })
    },

    // --- Boolean ---
    {
      key: 'faker.datatype.boolean',
      label: 'Boolean',
      category: 'Datatype',
      compatibleTypes: [BOOLEAN],
      generate: () => faker.datatype.boolean()
    },

    // --- Date ---
    {
      key: 'faker.date.past',
      label: 'Past Date',
      category: 'Date',
      compatibleTypes: [DATE, STRING],
      generate: () => faker.date.past().toISOString().split('T')[0]
    },
    {
      key: 'faker.date.future',
      label: 'Future Date',
      category: 'Date',
      compatibleTypes: [DATE, STRING],
      generate: () => faker.date.future().toISOString().split('T')[0]
    },
    {
      key: 'faker.date.recent',
      label: 'Recent Date',
      category: 'Date',
      compatibleTypes: [DATE, STRING],
      generate: () => faker.date.recent().toISOString().split('T')[0]
    },
    {
      key: 'faker.date.birthdate',
      label: 'Birthdate',
      category: 'Date',
      compatibleTypes: [DATE, STRING],
      generate: () => faker.date.birthdate().toISOString().split('T')[0]
    },

    // --- String ---
    {
      key: 'faker.string.uuid',
      label: 'UUID',
      category: 'String',
      compatibleTypes: [STRING],
      generate: () => faker.string.uuid()
    },
    {
      key: 'faker.string.alphanumeric',
      label: 'Alphanumeric',
      category: 'String',
      compatibleTypes: [STRING],
      argsSchema: { length: 'number' },
      generate: (args) => faker.string.alphanumeric(args?.length || 10)
    },
    {
      key: 'faker.string.numeric',
      label: 'Numeric String',
      category: 'String',
      compatibleTypes: [STRING],
      argsSchema: { length: 'number' },
      generate: (args) => faker.string.numeric(args?.length || 5)
    },

    // --- Phone ---
    {
      key: 'faker.phone.number',
      label: 'Phone Number',
      category: 'Phone',
      compatibleTypes: [STRING],
      generate: () => faker.phone.number()
    },

    // --- Commerce ---
    {
      key: 'faker.commerce.productName',
      label: 'Product Name',
      category: 'Commerce',
      compatibleTypes: [STRING],
      generate: () => faker.commerce.productName()
    },
    {
      key: 'faker.commerce.price',
      label: 'Price',
      category: 'Commerce',
      compatibleTypes: [STRING, FLOAT, DOUBLE],
      generate: (args) => parseFloat(faker.commerce.price(args))
    },
    {
      key: 'faker.commerce.department',
      label: 'Department',
      category: 'Commerce',
      compatibleTypes: [STRING],
      generate: () => faker.commerce.department()
    },

    // --- Color ---
    {
      key: 'faker.color.human',
      label: 'Color Name',
      category: 'Color',
      compatibleTypes: [STRING],
      generate: () => faker.color.human()
    },
    {
      key: 'faker.color.rgb',
      label: 'RGB Color',
      category: 'Color',
      compatibleTypes: [STRING],
      generate: () => faker.color.rgb()
    },

    // --- Internet (extended) ---
    { key: 'faker.internet.password', label: 'Password', category: 'Internet', compatibleTypes: [STRING], generate: () => faker.internet.password() },
    { key: 'faker.internet.domainName', label: 'Domain Name', category: 'Internet', compatibleTypes: [STRING], generate: () => faker.internet.domainName() },
    { key: 'faker.internet.domainSuffix', label: 'Domain Suffix', category: 'Internet', compatibleTypes: [STRING], generate: () => faker.internet.domainSuffix() },
    { key: 'faker.internet.mac', label: 'MAC Address', category: 'Internet', compatibleTypes: [STRING], generate: () => faker.internet.mac() },
    { key: 'faker.internet.userAgent', label: 'User Agent', category: 'Internet', compatibleTypes: [STRING], generate: () => faker.internet.userAgent() },
    { key: 'faker.internet.emoji', label: 'Emoji', category: 'Internet', compatibleTypes: [STRING], generate: () => faker.internet.emoji() },

    // --- Location (extended) ---
    { key: 'faker.location.streetAddress', label: 'Street Address', category: 'Location', compatibleTypes: [STRING], generate: () => faker.location.streetAddress() },
    { key: 'faker.location.buildingNumber', label: 'Building Number', category: 'Location', compatibleTypes: [STRING], generate: () => faker.location.buildingNumber() },
    { key: 'faker.location.countryCode', label: 'Country Code', category: 'Location', compatibleTypes: [STRING], generate: () => faker.location.countryCode() },
    { key: 'faker.location.latitude', label: 'Latitude', category: 'Location', compatibleTypes: [DOUBLE, FLOAT, STRING], generate: () => faker.location.latitude() },
    { key: 'faker.location.longitude', label: 'Longitude', category: 'Location', compatibleTypes: [DOUBLE, FLOAT, STRING], generate: () => faker.location.longitude() },
    { key: 'faker.location.county', label: 'County', category: 'Location', compatibleTypes: [STRING], generate: () => faker.location.county() },
    { key: 'faker.location.continent', label: 'Continent', category: 'Location', compatibleTypes: [STRING], generate: () => faker.location.continent() },

    // --- Person (extended) ---
    { key: 'faker.person.sex', label: 'Sex', category: 'Person', compatibleTypes: [STRING], generate: () => faker.person.sex() },
    { key: 'faker.person.bio', label: 'Bio', category: 'Person', compatibleTypes: [STRING], generate: () => faker.person.bio() },
    { key: 'faker.person.zodiacSign', label: 'Zodiac Sign', category: 'Person', compatibleTypes: [STRING], generate: () => faker.person.zodiacSign() },
    { key: 'faker.person.jobArea', label: 'Job Area', category: 'Person', compatibleTypes: [STRING], generate: () => faker.person.jobArea() },
    { key: 'faker.person.jobType', label: 'Job Type', category: 'Person', compatibleTypes: [STRING], generate: () => faker.person.jobType() },

    // --- Finance ---
    { key: 'faker.finance.iban', label: 'IBAN', category: 'Finance', compatibleTypes: [STRING], generate: () => faker.finance.iban() },
    { key: 'faker.finance.bic', label: 'BIC', category: 'Finance', compatibleTypes: [STRING], generate: () => faker.finance.bic() },
    { key: 'faker.finance.creditCardNumber', label: 'Credit Card', category: 'Finance', compatibleTypes: [STRING], generate: () => faker.finance.creditCardNumber() },
    { key: 'faker.finance.currencyName', label: 'Currency Name', category: 'Finance', compatibleTypes: [STRING], generate: () => faker.finance.currencyName() },
    { key: 'faker.finance.currencyCode', label: 'Currency Code', category: 'Finance', compatibleTypes: [STRING], generate: () => faker.finance.currencyCode() },
    { key: 'faker.finance.amount', label: 'Amount', category: 'Finance', compatibleTypes: [DOUBLE, FLOAT, STRING], generate: () => parseFloat(faker.finance.amount()) },

    // --- Book ---
    { key: 'faker.book.title', label: 'Book Title', category: 'Book', compatibleTypes: [STRING], generate: () => faker.book.title() },
    { key: 'faker.book.author', label: 'Book Author', category: 'Book', compatibleTypes: [STRING], generate: () => faker.book.author() },
    { key: 'faker.book.publisher', label: 'Publisher', category: 'Book', compatibleTypes: [STRING], generate: () => faker.book.publisher() },
    { key: 'faker.book.genre', label: 'Book Genre', category: 'Book', compatibleTypes: [STRING], generate: () => faker.book.genre() },

    // --- Music ---
    { key: 'faker.music.genre', label: 'Music Genre', category: 'Music', compatibleTypes: [STRING], generate: () => faker.music.genre() },
    { key: 'faker.music.songName', label: 'Song Name', category: 'Music', compatibleTypes: [STRING], generate: () => faker.music.songName() },
    { key: 'faker.music.artist', label: 'Artist', category: 'Music', compatibleTypes: [STRING], generate: () => faker.music.artist() },
    { key: 'faker.music.album', label: 'Album', category: 'Music', compatibleTypes: [STRING], generate: () => faker.music.album() },

    // --- Food ---
    { key: 'faker.food.dish', label: 'Dish', category: 'Food', compatibleTypes: [STRING], generate: () => faker.food.dish() },
    { key: 'faker.food.fruit', label: 'Fruit', category: 'Food', compatibleTypes: [STRING], generate: () => faker.food.fruit() },
    { key: 'faker.food.vegetable', label: 'Vegetable', category: 'Food', compatibleTypes: [STRING], generate: () => faker.food.vegetable() },
    { key: 'faker.food.ingredient', label: 'Ingredient', category: 'Food', compatibleTypes: [STRING], generate: () => faker.food.ingredient() },
    { key: 'faker.food.spice', label: 'Spice', category: 'Food', compatibleTypes: [STRING], generate: () => faker.food.spice() },

    // --- Animal ---
    { key: 'faker.animal.type', label: 'Animal Type', category: 'Animal', compatibleTypes: [STRING], generate: () => faker.animal.type() },
    { key: 'faker.animal.dog', label: 'Dog Breed', category: 'Animal', compatibleTypes: [STRING], generate: () => faker.animal.dog() },
    { key: 'faker.animal.cat', label: 'Cat Breed', category: 'Animal', compatibleTypes: [STRING], generate: () => faker.animal.cat() },
    { key: 'faker.animal.bird', label: 'Bird', category: 'Animal', compatibleTypes: [STRING], generate: () => faker.animal.bird() },
    { key: 'faker.animal.petName', label: 'Pet Name', category: 'Animal', compatibleTypes: [STRING], generate: () => faker.animal.petName() },

    // --- Airline (maps to Java's faker.aviation) ---
    { key: 'faker.airline.airport', label: 'Airport', category: 'Airline', compatibleTypes: [STRING], generate: () => { const a = faker.airline.airport(); return `${a.name} (${a.iataCode})` } },
    { key: 'faker.airline.airline', label: 'Airline', category: 'Airline', compatibleTypes: [STRING], generate: () => faker.airline.airline().name },
    { key: 'faker.airline.airplane', label: 'Airplane', category: 'Airline', compatibleTypes: [STRING], generate: () => faker.airline.airplane().name },
    { key: 'faker.airline.flightNumber', label: 'Flight Number', category: 'Airline', compatibleTypes: [STRING], generate: () => faker.airline.flightNumber() },

    // --- Science ---
    { key: 'faker.science.chemicalElement', label: 'Chemical Element', category: 'Science', compatibleTypes: [STRING], generate: () => faker.science.chemicalElement().name },
    { key: 'faker.science.unit', label: 'Unit', category: 'Science', compatibleTypes: [STRING], generate: () => faker.science.unit().name },

    // --- Vehicle ---
    { key: 'faker.vehicle.vehicle', label: 'Vehicle', category: 'Vehicle', compatibleTypes: [STRING], generate: () => faker.vehicle.vehicle() },
    { key: 'faker.vehicle.manufacturer', label: 'Manufacturer', category: 'Vehicle', compatibleTypes: [STRING], generate: () => faker.vehicle.manufacturer() },
    { key: 'faker.vehicle.model', label: 'Model', category: 'Vehicle', compatibleTypes: [STRING], generate: () => faker.vehicle.model() },
    { key: 'faker.vehicle.vin', label: 'VIN', category: 'Vehicle', compatibleTypes: [STRING], generate: () => faker.vehicle.vin() },
    { key: 'faker.vehicle.fuel', label: 'Fuel', category: 'Vehicle', compatibleTypes: [STRING], generate: () => faker.vehicle.fuel() },

    // --- System / File ---
    { key: 'faker.system.fileName', label: 'File Name', category: 'System', compatibleTypes: [STRING], generate: () => faker.system.fileName() },
    { key: 'faker.system.fileExt', label: 'File Extension', category: 'System', compatibleTypes: [STRING], generate: () => faker.system.fileExt() },
    { key: 'faker.system.mimeType', label: 'MIME Type', category: 'System', compatibleTypes: [STRING], generate: () => faker.system.mimeType() },
    { key: 'faker.system.semver', label: 'SemVer', category: 'System', compatibleTypes: [STRING], generate: () => faker.system.semver() },

    // --- Commerce (extended) ---
    { key: 'faker.commerce.isbn', label: 'ISBN', category: 'Commerce', compatibleTypes: [STRING], generate: () => faker.commerce.isbn() },
    { key: 'faker.commerce.productMaterial', label: 'Material', category: 'Commerce', compatibleTypes: [STRING], generate: () => faker.commerce.productMaterial() },
    { key: 'faker.commerce.productDescription', label: 'Product Description', category: 'Commerce', compatibleTypes: [STRING], generate: () => faker.commerce.productDescription() },

    // --- Database ---
    { key: 'faker.database.engine', label: 'DB Engine', category: 'Database', compatibleTypes: [STRING], generate: () => faker.database.engine() },
    { key: 'faker.database.column', label: 'DB Column', category: 'Database', compatibleTypes: [STRING], generate: () => faker.database.column() },
    { key: 'faker.database.type', label: 'DB Type', category: 'Database', compatibleTypes: [STRING], generate: () => faker.database.type() },

    // --- Hacker ---
    { key: 'faker.hacker.phrase', label: 'Hacker Phrase', category: 'Hacker', compatibleTypes: [STRING], generate: () => faker.hacker.phrase() },
    { key: 'faker.hacker.abbreviation', label: 'Abbreviation', category: 'Hacker', compatibleTypes: [STRING], generate: () => faker.hacker.abbreviation() },

    // --- Word ---
    { key: 'faker.word.noun', label: 'Noun', category: 'Word', compatibleTypes: [STRING], generate: () => faker.word.noun() },
    { key: 'faker.word.verb', label: 'Verb', category: 'Word', compatibleTypes: [STRING], generate: () => faker.word.verb() },
    { key: 'faker.word.adjective', label: 'Adjective', category: 'Word', compatibleTypes: [STRING], generate: () => faker.word.adjective() },

    // --- Image ---
    { key: 'faker.image.url', label: 'Image URL', category: 'Image', compatibleTypes: [STRING], generate: () => faker.image.url() },

    // --- Number (extended) ---
    { key: 'faker.number.singleDigit', label: 'Single Digit (0-9)', category: 'Number', compatibleTypes: [INT, STRING], generate: () => faker.number.int({ min: 0, max: 9 }) },

    // --- Commerce (extended 2) ---
    { key: 'faker.commerce.promotionCode', label: 'Promotion Code', category: 'Commerce', compatibleTypes: [STRING], generate: () => `${faker.string.alpha({ length: 3, casing: 'upper' })}-${faker.number.int({ min: 100, max: 999 })}` },

    // --- Code (barcodes) ---
    { key: 'faker.code.ean8', label: 'EAN-8', category: 'Code', compatibleTypes: [STRING], generate: () => faker.string.numeric(8) },
    { key: 'faker.code.ean13', label: 'EAN-13', category: 'Code', compatibleTypes: [STRING], generate: () => faker.string.numeric(13) },

    // --- Country ---
    { key: 'faker.country.flag', label: 'Country Flag Emoji', category: 'Country', compatibleTypes: [STRING], generate: () => { const code = faker.location.countryCode(); return String.fromCodePoint(...[...code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) } },

    // --- Animal (extended) ---
    { key: 'faker.animal.genus', label: 'Animal Genus', category: 'Animal', compatibleTypes: [STRING], generate: () => faker.helpers.arrayElement(['Canis', 'Felis', 'Equus', 'Bos', 'Ovis', 'Capra', 'Sus', 'Cervus', 'Ursus', 'Panthera', 'Aquila', 'Falco', 'Corvus', 'Columba', 'Salmo', 'Thunnus']) },

    // --- Space ---
    { key: 'faker.space.planet', label: 'Planet', category: 'Space', compatibleTypes: [STRING], generate: () => faker.helpers.arrayElement(['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']) },
    { key: 'faker.space.galaxy', label: 'Galaxy', category: 'Space', compatibleTypes: [STRING], generate: () => faker.helpers.arrayElement(['Milky Way', 'Andromeda', 'Triangulum', 'Whirlpool', 'Sombrero', 'Pinwheel', 'Cartwheel', 'Centaurus A', 'Large Magellanic Cloud', 'Small Magellanic Cloud']) },
    { key: 'faker.space.constellation', label: 'Constellation', category: 'Space', compatibleTypes: [STRING], generate: () => faker.helpers.arrayElement(['Orion', 'Ursa Major', 'Cassiopeia', 'Scorpius', 'Leo', 'Gemini', 'Aquarius', 'Sagittarius', 'Taurus', 'Virgo', 'Pisces', 'Cygnus']) },
    { key: 'faker.space.star', label: 'Star', category: 'Space', compatibleTypes: [STRING], generate: () => faker.helpers.arrayElement(['Sirius', 'Canopus', 'Arcturus', 'Vega', 'Capella', 'Rigel', 'Betelgeuse', 'Altair', 'Aldebaran', 'Antares', 'Spica', 'Pollux', 'Deneb', 'Polaris']) },
    { key: 'faker.space.nebula', label: 'Nebula', category: 'Space', compatibleTypes: [STRING], generate: () => faker.helpers.arrayElement(['Orion Nebula', 'Eagle Nebula', 'Crab Nebula', 'Ring Nebula', 'Horsehead Nebula', 'Lagoon Nebula', 'Helix Nebula', 'Cats Eye Nebula', 'Rosette Nebula', 'Tarantula Nebula']) },

    // --- Weather (temperature) ---
    { key: 'faker.weather.temperatureCelsius', label: 'Temperature (C)', category: 'Weather', compatibleTypes: [DOUBLE, FLOAT, INT, STRING], generate: () => faker.number.float({ min: -20, max: 40, fractionDigits: 1 }) },

    // --- Helpers (Enum) ---
    {
      key: 'faker.helpers.arrayElement',
      label: 'Array Element (Enum)',
      category: 'Helpers',
      compatibleTypes: ['*'],
      argsSchema: { values: 'string[]' },
      generate: (args) => {
        const values = args?.values || ['A', 'B', 'C']
        return faker.helpers.arrayElement(values)
      }
    },

    // --- Sequence ---
    {
      key: 'sequence.counter',
      label: 'Counter (1, 2, 3...)',
      category: 'Sequence',
      compatibleTypes: [INT, LONG, SHORT, STRING],
      generate: (_args, index) => (index ?? 0) + 1
    },
    {
      key: 'sequence.prefixed',
      label: 'Prefixed ID (e.g. EMP-001)',
      category: 'Sequence',
      compatibleTypes: [STRING],
      argsSchema: { prefix: 'string', padding: 'number' },
      generate: (args, index) => {
        const prefix = args?.prefix || 'ID'
        const padding = args?.padding || 3
        const num = ((index ?? 0) + 1).toString().padStart(padding, '0')
        return `${prefix}-${num}`
      }
    }
  ]
}

/**
 * Set faker locale
 */
export function setFakerLocale(locale: string) {
  // faker-js/faker v9 uses faker.setLocale or we can import locale-specific fakers
  // For simplicity we use the global faker
  try {
    (faker as any).locale = locale
  } catch {
    // Locale not available, keep default
  }
}

/**
 * Set faker seed
 */
export function setFakerSeed(seed: number) {
  if (seed > 0) {
    faker.seed(seed)
  }
}

/**
 * Get the faker instance for use in custom generators
 */
export function getFaker() {
  return faker
}

/**
 * Initialize and register all built-in faker providers
 */
export function registerFakerProviders() {
  const registry = useGeneratorRegistry()
  const generators = createFakerGenerators()
  registry.registerAll(generators)
  return generators.length
}
