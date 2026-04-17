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
