import { RecentOrder } from '@/types/analytics';

/**
 * Rusya Federasyonu İdari Yapısı (3 Kademe):
 * 1. Federal Yönetim Bölgesi (Federal District / Федеральный округ)
 * 2. Eyalet / Federe Birim (Federal Subject / Область, Край, Республика, Автономный округ, Город федерального значения)
 * 3. Şehir (City / Город)
 */

export interface FederalDistrictDef {
  id: string;
  nameTr: string;
  nameRu: string;
  code: string;
  badgeColor: string;
  subjects: FederalSubjectDef[];
}

export interface FederalSubjectDef {
  id: string;
  nameTr: string;
  nameRu: string;
  aliases: string[];
  majorCities?: string[];
}

export const FEDERAL_DISTRICTS: FederalDistrictDef[] = [
  {
    id: 'central',
    nameTr: 'Merkez Federal Bölgesi',
    nameRu: 'Центральный федеральный округ',
    code: 'ЦФО',
    badgeColor: '#4C8DFF', // brand blue
    subjects: [
      {
        id: 'moscow_city',
        nameTr: 'Moskova (Şehir)',
        nameRu: 'Москва',
        aliases: ['Москва', 'г. Москва', 'город Москва', 'Moscow', 'Moskova'],
        majorCities: ['Москва', 'Moscow'],
      },
      {
        id: 'moscow_oblast',
        nameTr: 'Moskova Bölgesi',
        nameRu: 'Московская область',
        aliases: ['Московская область', 'Московская обл.', 'Подмосковье', 'Moskovskaya oblast'],
        majorCities: [
          'Подольск', 'Балашиха', 'Химки', 'Мытищи', 'Королёв', 'Люберцы', 'Красногорск',
          'Одинцово', 'Домодедово', 'Щёлково', 'Серпухов', 'Коломна', 'Долгопрудный', 'Раменское',
          'Реутов', 'Жуковский', 'Пушкино', 'Ногинск', 'Орехово-Зуево', 'Видное', 'Лобня'
        ],
      },
      {
        id: 'belgorod_oblast',
        nameTr: 'Belgorod Bölgesi',
        nameRu: 'Белгородская область',
        aliases: ['Белгородская область', 'Белгородская обл.'],
        majorCities: ['Белгород', 'Старый Оскол', 'Губкин', 'Шебекино'],
      },
      {
        id: 'bryansk_oblast',
        nameTr: 'Bryansk Bölgesi',
        nameRu: 'Брянская область',
        aliases: ['Брянская область', 'Брянская обл.'],
        majorCities: ['Брянск', 'Клинцы', 'Новозыбков'],
      },
      {
        id: 'vladimir_oblast',
        nameTr: 'Vladimir Bölgesi',
        nameRu: 'Владимирская область',
        aliases: ['Владимирская область', 'Владимирская обл.'],
        majorCities: ['Владимир', 'Ковров', 'Муром', 'Александров', 'Гусь-Хрустальный'],
      },
      {
        id: 'voronezh_oblast',
        nameTr: 'Voronej Bölgesi',
        nameRu: 'Воронежская область',
        aliases: ['Воронежская область', 'Воронежская обл.'],
        majorCities: ['Воронеж', 'Борисоглебск', 'Россошь', 'Лиски'],
      },
      {
        id: 'ivanovo_oblast',
        nameTr: 'İvanovo Bölgesi',
        nameRu: 'Ивановская область',
        aliases: ['Ивановская область', 'Ивановская обл.'],
        majorCities: ['Иваново', 'Кинешма', 'Шуя', 'Вичуга'],
      },
      {
        id: 'kaluga_oblast',
        nameTr: 'Kaluga Bölgesi',
        nameRu: 'Калужская область',
        aliases: ['Калужская область', 'Калужская обл.'],
        majorCities: ['Калуга', 'Обнинск', 'Людиново', 'Киров'],
      },
      {
        id: 'kostroma_oblast',
        nameTr: 'Kostroma Bölgesi',
        nameRu: 'Костромская область',
        aliases: ['Костромская область', 'Костромская обл.'],
        majorCities: ['Кострома', 'Буй', 'Шарья'],
      },
      {
        id: 'kursk_oblast',
        nameTr: 'Kursk Bölgesi',
        nameRu: 'Курская область',
        aliases: ['Курская область', 'Курская обл.'],
        majorCities: ['Курск', 'Железногорск', 'Курчатов'],
      },
      {
        id: 'lipetsk_oblast',
        nameTr: 'Lipetsk Bölgesi',
        nameRu: 'Липецкая область',
        aliases: ['Липецкая область', 'Липецкая обл.'],
        majorCities: ['Липецк', 'Елец', 'Грязи'],
      },
      {
        id: 'oryol_oblast',
        nameTr: 'Oryol Bölgesi',
        nameRu: 'Орловская область',
        aliases: ['Орловская область', 'Орловская обл.'],
        majorCities: ['Орёл', 'Ливны', 'Мценск'],
      },
      {
        id: 'ryazan_oblast',
        nameTr: 'Ryazan Bölgesi',
        nameRu: 'Рязанская область',
        aliases: ['Рязанская область', 'Рязанская обл.'],
        majorCities: ['Рязань', 'Касимов', 'Скопин', 'Сасово'],
      },
      {
        id: 'smolensk_oblast',
        nameTr: 'Smolensk Bölgesi',
        nameRu: 'Смоленская область',
        aliases: ['Смоленская область', 'Смоленская обл.'],
        majorCities: ['Смоленск', 'Вязьма', 'Рославль', 'Ярцево', 'Сафоново'],
      },
      {
        id: 'tambov_oblast',
        nameTr: 'Tambov Bölgesi',
        nameRu: 'Тамбовская область',
        aliases: ['Тамбовская область', 'Тамбовская обл.'],
        majorCities: ['Тамбов', 'Мичуринск', 'Рассказово', 'Моршанск'],
      },
      {
        id: 'tver_oblast',
        nameTr: 'Tver Bölgesi',
        nameRu: 'Тверская область',
        aliases: ['Тверская область', 'Тверская обл.'],
        majorCities: ['Tver', 'Ржев', 'Вышний Волочёк', 'Кимры', 'Торжок', 'Конаково'],
      },
      {
        id: 'tula_oblast',
        nameTr: 'Tula Bölgesi',
        nameRu: 'Тульская область',
        aliases: ['Тульская область', 'Тульская обл.'],
        majorCities: ['Тула', 'Новомосковск', 'Донской', 'Алексин', 'Щёкино', 'Узловая'],
      },
      {
        id: 'yaroslavl_oblast',
        nameTr: 'Yaroslavl Bölgesi',
        nameRu: 'Ярославская область',
        aliases: ['Ярославская область', 'Ярославская обл.'],
        majorCities: ['Ярославль', 'Рыбинск', 'Тутаев', 'Переславль-Залесский', 'Углич', 'Ростов'],
      },
    ],
  },
  {
    id: 'northwestern',
    nameTr: 'Kuzeybatı Federal Bölgesi',
    nameRu: 'Северо-Западный федеральный округ',
    code: 'СЗФО',
    badgeColor: '#38BDF8', // sky
    subjects: [
      {
        id: 'saint_petersburg',
        nameTr: 'St. Petersburg (Şehir)',
        nameRu: 'Санкт-Петербург',
        aliases: ['Санкт-Петербург', 'г. Санкт-Петербург', 'Питер', 'Saint Petersburg', 'St. Petersburg'],
        majorCities: ['Санкт-Петербург', 'Saint Petersburg'],
      },
      {
        id: 'leningrad_oblast',
        nameTr: 'Leningrad Bölgesi',
        nameRu: 'Ленинградская область',
        aliases: ['Ленинградская область', 'Ленинградская обл.'],
        majorCities: ['Гатчина', 'Выборг', 'Всеволожск', 'Сосновый Бор', 'Тихвин', 'Кириши', 'Кингисепп'],
      },
      {
        id: 'arkhangelsk_oblast',
        nameTr: 'Arhangelsk Bölgesi',
        nameRu: 'Архангельская область',
        aliases: ['Архангельская область', 'Архангельская обл.'],
        majorCities: ['Архангельск', 'Северодвинск', 'Котлас'],
      },
      {
        id: 'vologda_oblast',
        nameTr: 'Vologda Bölgesi',
        nameRu: 'Вологодская область',
        aliases: ['Вологодская область', 'Вологодская обл.'],
        majorCities: ['Вологда', 'Череповец', 'Сокол', 'Великий Устюг'],
      },
      {
        id: 'kaliningrad_oblast',
        nameTr: 'Kaliningrad Bölgesi',
        nameRu: 'Калининградская область',
        aliases: ['Калининградская область', 'Калининградская обл.'],
        majorCities: ['Калининград', 'Советск', 'Черняховск', 'Балтийск'],
      },
      {
        id: 'karelia_republic',
        nameTr: 'Karelya Cumhuriyeti',
        nameRu: 'Республика Карелия',
        aliases: ['Республика Карелия', 'Карелия'],
        majorCities: ['Петрозаводск', 'Кондопога', 'Сегежа', 'Костомукша', 'Сортавала'],
      },
      {
        id: 'komi_republic',
        nameTr: 'Komi Cumhuriyeti',
        nameRu: 'Республика Коми',
        aliases: ['Республика Коми', 'Коми'],
        majorCities: ['Сыктывкар', 'Ухта', 'Воркута', 'Печора', 'Усинск'],
      },
      {
        id: 'murmansk_oblast',
        nameTr: 'Murmansk Bölgesi',
        nameRu: 'Мурманская область',
        aliases: ['Мурманская область', 'Мурманская обл.'],
        majorCities: ['Мурманск', 'Апатиты', 'Североморск', 'Мончегорск', 'Кандалакша', 'Кировск'],
      },
      {
        id: 'novgorod_oblast',
        nameTr: 'Novgorod Bölgesi',
        nameRu: 'Новгородская область',
        aliases: ['Новгородская область', 'Новгородская обл.'],
        majorCities: ['Великий Новгород', 'Боровичи', 'Старая Русса'],
      },
      {
        id: 'pskov_oblast',
        nameTr: 'Pskov Bölgesi',
        nameRu: 'Псковская область',
        aliases: ['Псковская область', 'Псковская обл.'],
        majorCities: ['Псков', 'Великие Луки', 'Остров'],
      },
      {
        id: 'nenets_ao',
        nameTr: 'Nenets Özerk Okrugu',
        nameRu: 'Ненецкий автономный округ',
        aliases: ['Ненецкий автономный округ', 'Ненецкий АО'],
        majorCities: ['Нарьян-Мар'],
      },
    ],
  },
  {
    id: 'southern',
    nameTr: 'Güney Federal Bölgesi',
    nameRu: 'Южный федеральный округ',
    code: 'ЮФО',
    badgeColor: '#D9A441', // caution / warm amber
    subjects: [
      {
        id: 'krasnodar_krai',
        nameTr: 'Krasnodar Krayı',
        nameRu: 'Краснодарский край',
        aliases: ['Краснодарский край', 'Кубань', 'Krasnodar Krai'],
        majorCities: [
          'Краснодар', 'Сочи', 'Новороссийск', 'Армавир', 'Ейск', 'Анапа', 'Геленджик',
          'Кропоткин', 'Славянск-на-Кубани', 'Туапсе', 'Лабинск', 'Тихорецк', 'Крымск', 'Тимашёвск'
        ],
      },
      {
        id: 'rostov_oblast',
        nameTr: 'Rostov Bölgesi',
        nameRu: 'Ростовская область',
        aliases: ['Ростовская область', 'Ростовская обл.', 'Rostov Oblast'],
        majorCities: [
          'Ростов-на-Дону', 'Таганрог', 'Шахты', 'Новочеркасск', 'Волгодонск', 'Батайск',
          'Новошахтинск', 'Каменск-Шахтинский', 'Азов', 'Гуково', 'Сальск', 'Донецк'
        ],
      },
      {
        id: 'volgograd_oblast',
        nameTr: 'Volgograd Bölgesi',
        nameRu: 'Волгоградская область',
        aliases: ['Волгоградская область', 'Волгоградская обл.'],
        majorCities: ['Волгоград', 'Волжский', 'Камышин', 'Михайловка', 'Урюпинск'],
      },
      {
        id: 'astrakhan_oblast',
        nameTr: 'Astrahan Bölgesi',
        nameRu: 'Астраханская область',
        aliases: ['Астраханская область', 'Астраханская обл.'],
        majorCities: ['Астрахань', 'Ахтубинск', 'Знаменск'],
      },
      {
        id: 'adygea_republic',
        nameTr: 'Adıge Cumhuriyeti',
        nameRu: 'Республика Адыгея',
        aliases: ['Республика Адыгея', 'Адыгея'],
        majorCities: ['Майкоп', 'Яблоновский', 'Энем'],
      },
      {
        id: 'kalmykia_republic',
        nameTr: 'Kalmıkya Cumhuriyeti',
        nameRu: 'Республика Калмыкия',
        aliases: ['Республика Калмыкия', 'Калмыкия'],
        majorCities: ['Элиста'],
      },
      {
        id: 'crimea_republic',
        nameTr: 'Kırım Cumhuriyeti',
        nameRu: 'Республика Крым',
        aliases: ['Республика Крым', 'Крым'],
        majorCities: ['Симферополь', 'Керчь', 'Евпатория', 'Ялта', 'Феодосия', 'Алушта', 'Джанкой'],
      },
      {
        id: 'sevastopol_city',
        nameTr: 'Sivastopol (Şehir)',
        nameRu: 'Севастополь',
        aliases: ['Севастополь', 'г. Севастополь'],
        majorCities: ['Севастополь'],
      },
    ],
  },
  {
    id: 'north_caucasian',
    nameTr: 'Kuzey Kafkasya Federal Bölgesi',
    nameRu: 'Северо-Кавказский федеральный округ',
    code: 'СКФО',
    badgeColor: '#A855F7', // purple
    subjects: [
      {
        id: 'stavropol_krai',
        nameTr: 'Stavropol Krayı',
        nameRu: 'Ставропольский край',
        aliases: ['Ставропольский край'],
        majorCities: [
          'Ставрополь', 'Пятигорск', 'Кисловодск', 'Невинномысск', 'Ессентуки', 'Михайловск',
          'Минеральные Воды', 'Георгиевск', 'Будённовск'
        ],
      },
      {
        id: 'dagestan_republic',
        nameTr: 'Dağıstan Cumhuriyeti',
        nameRu: 'Республика Дагестан',
        aliases: ['Республика Дагестан', 'Дагестан'],
        majorCities: ['Махачкала', 'Хасавюрт', 'Дербент', 'Каспийск', 'Буйнакск', 'Избербаш', 'Кизляр'],
      },
      {
        id: 'chechen_republic',
        nameTr: 'Çeçenistan Cumhuriyeti',
        nameRu: 'Чеченская Республика',
        aliases: ['Чеченская Республика', 'Чечня', 'Чеченская республика'],
        majorCities: ['Грозный', 'Гудермес', 'Урус-Мартан', 'Шали', 'Аргун'],
      },
      {
        id: 'ingushetia_republic',
        nameTr: 'İnguşetya Cumhuriyeti',
        nameRu: 'Республика Ингушетия',
        aliases: ['Республика Ингушетия', 'Ингушетия'],
        majorCities: ['Назрань', 'Сунжа', 'Карабулак', 'Малгобек', 'Магас'],
      },
      {
        id: 'kabardino_balkar_republic',
        nameTr: 'Kabardey-Balkar Cumhuriyeti',
        nameRu: 'Кабардино-Балкарская Республика',
        aliases: ['Кабардино-Балкарская Республика', 'Кабардино-Балкария'],
        majorCities: ['Нальчик', 'Прохладный', 'Баксан', 'Нарткала'],
      },
      {
        id: 'karachay_cherkess_republic',
        nameTr: 'Karaçay-Çerkes Cumhuriyeti',
        nameRu: 'Карачаево-Черкесская Республика',
        aliases: ['Карачаево-Черкесская Республика', 'Карачаево-Черкесия'],
        majorCities: ['Черкесск', 'Усть-Джегута', 'Карачаевск'],
      },
      {
        id: 'north_ossetia_republic',
        nameTr: 'Kuzey Osetya Cumhuriyeti',
        nameRu: 'Республика Северная Осетия — Алания',
        aliases: ['Республика Северная Осетия — Алания', 'Северная Осетия', 'Республика Северная Осетия'],
        majorCities: ['Владикавказ', 'Моздок', 'Беслан', 'Алагир'],
      },
    ],
  },
  {
    id: 'volga',
    nameTr: 'Volga Federal Bölgesi',
    nameRu: 'Приволжский федеральный округ',
    code: 'ПФО',
    badgeColor: '#10B981', // emerald
    subjects: [
      {
        id: 'tatarstan_republic',
        nameTr: 'Tataristan Cumhuriyeti (Kazan)',
        nameRu: 'Республика Татарстан',
        aliases: ['Республика Татарстан', 'Татарстан'],
        majorCities: [
          'Казань', 'Набережные Челны', 'Нижнекамск', 'Альметьевск', 'Зеленодольск',
          'Бугульма', 'Елабуга', 'Лениногорск', 'Чистополь'
        ],
      },
      {
        id: 'bashkortostan_republic',
        nameTr: 'Başkurdistan Cumhuriyeti (Ufa)',
        nameRu: 'Республика Башкортостан',
        aliases: ['Республика Башкортостан', 'Башкортостан', 'Башкирия'],
        majorCities: [
          'Уфа', 'Стерлитамак', 'Салават', 'Нефтекамск', 'Октябрьский',
          'Белорецк', 'Ишимбай', 'Туймазы', 'Кумертау', 'Сибай'
        ],
      },
      {
        id: 'nizhny_novgorod_oblast',
        nameTr: 'Nijni Novgorod Bölgesi',
        nameRu: 'Нижегородская область',
        aliases: ['Нижегородская область', 'Нижегородская обл.'],
        majorCities: ['Нижний Новгород', 'Дзержинск', 'Арзамас', 'Саров', 'Бор', 'Кстово', 'Павлово', 'Выкса'],
      },
      {
        id: 'samara_oblast',
        nameTr: 'Samara Bölgesi',
        nameRu: 'Самарская область',
        aliases: ['Самарская область', 'Самарская обл.'],
        majorCities: ['Самара', 'Тольятти', 'Сызрань', 'Новокуйбышевск', 'Чапаевск', 'Жигулёвск'],
      },
      {
        id: 'saratov_oblast',
        nameTr: 'Saratov Bölgesi',
        nameRu: 'Саратовская область',
        aliases: ['Саратовская область', 'Саратовская обл.'],
        majorCities: ['Саратов', 'Энгельс', 'Балаково', 'Балашов', 'Вольск'],
      },
      {
        id: 'perm_krai',
        nameTr: 'Perm Krayı',
        nameRu: 'Пермский край',
        aliases: ['Пермский край'],
        majorCities: ['Пермь', 'Березники', 'Соликамск', 'Чайковский', 'Кунгур', 'Лысьва'],
      },
      {
        id: 'orenburg_oblast',
        nameTr: 'Orenburg Bölgesi',
        nameRu: 'Оренбургская область',
        aliases: ['Оренбургская область', 'Оренбургская обл.'],
        majorCities: ['Оренбург', 'Орск', 'Новотроицк', 'Бузулук'],
      },
      {
        id: 'penza_oblast',
        nameTr: 'Penza Bölgesi',
        nameRu: 'Пензенская область',
        aliases: ['Пензенская область', 'Пензенская обл.'],
        majorCities: ['Пенза', 'Кузнецк', 'Заречный', 'Каменка'],
      },
      {
        id: 'ulyanovsk_oblast',
        nameTr: 'Ulyanovsk Bölgesi',
        nameRu: 'Ульяновская область',
        aliases: ['Ульяновская область', 'Ульяновская обл.'],
        majorCities: ['Ульяновск', 'Димитровград', 'Инза'],
      },
      {
        id: 'kirov_oblast',
        nameTr: 'Kirov Bölgesi',
        nameRu: 'Кировская область',
        aliases: ['Кировская область', 'Кировская обл.'],
        majorCities: ['Киров', 'Кирово-Чепецк', 'Вятские Поляны', 'Слободской'],
      },
      {
        id: 'udmurt_republic',
        nameTr: 'Udmurtya Cumhuriyeti',
        nameRu: 'Удмуртская Республика',
        aliases: ['Удмуртская Республика', 'Удмуртия'],
        majorCities: ['Ижевск', 'Сарапул', 'Воткинск', 'Глазов', 'Можга'],
      },
      {
        id: 'chuvash_republic',
        nameTr: 'Çuvaşistan Cumhuriyeti',
        nameRu: 'Чувашская Республика',
        aliases: ['Чувашская Республика', 'Чувашия'],
        majorCities: ['Чебоксары', 'Новочебоксарск', 'Канаш', 'Алатырь', 'Шумерля'],
      },
      {
        id: 'mordovia_republic',
        nameTr: 'Mordovya Cumhuriyeti',
        nameRu: 'Республика Мордовия',
        aliases: ['Республика Мордовия', 'Мордовия'],
        majorCities: ['Саранск', 'Рузаевка', 'Ковылкино'],
      },
      {
        id: 'mari_el_republic',
        nameTr: 'Mari El Cumhuriyeti',
        nameRu: 'Республика Марий Эл',
        aliases: ['Республика Марий Эл', 'Марий Эл'],
        majorCities: ['Йошкар-Ола', 'Волжск', 'Козьмодемьянск'],
      },
    ],
  },
  {
    id: 'ural',
    nameTr: 'Ural Federal Bölgesi',
    nameRu: 'Уральский федеральный округ',
    code: 'УрФО',
    badgeColor: '#35C07E', // gain green
    subjects: [
      {
        id: 'sverdlovsk_oblast',
        nameTr: 'Sverdlovsk Bölgesi (Yekaterinburg)',
        nameRu: 'Свердловская область',
        aliases: ['Свердловская область', 'Свердловская обл.'],
        majorCities: [
          'Екатеринбург', 'Нижний Тагил', 'Каменск-Уральский', 'Первоуральск', 'Серов',
          'Новоуральск', 'Асбест', 'Полевской', 'Ревда', 'Краснотурьинск', 'Берёзовский'
        ],
      },
      {
        id: 'chelyabinsk_oblast',
        nameTr: 'Çelyabinsk Bölgesi',
        nameRu: 'Челябинская область',
        aliases: ['Челябинская область', 'Челябинская обл.'],
        majorCities: [
          'Челябинск', 'Магнитогорск', 'Златоуст', 'Миасс', 'Копейск',
          'Озёрск', 'Троицк', 'Снежинск', 'Сатка', 'Чебаркуль'
        ],
      },
      {
        id: 'tyumen_oblast',
        nameTr: 'Tyumen Bölgesi',
        nameRu: 'Тюменская область',
        aliases: ['Тюменская область', 'Тюменская обл.'],
        majorCities: ['Тюмень', 'Тобольск', 'Ишим', 'Ялуторовск', 'Заводоуковск'],
      },
      {
        id: 'khanty_mansi_ao',
        nameTr: 'Hantı-Mansiysk Özerk Okrugu (Yugra)',
        nameRu: 'Ханты-Мансийский автономный округ — Югра',
        aliases: [
          'Ханты-Мансийский автономный округ — Югра', 'Ханты-Мансийский автономный округ - Югра',
          'Ханты-Мансийский АО - Югра', 'Ханты-Мансийский АО', 'Югра', 'ХМАО'
        ],
        majorCities: ['Сургут', 'Нижневартовск', 'Нефтеюганск', 'Ханты-Мансийск', 'Когалым', 'Нягань'],
      },
      {
        id: 'yamalo_nenets_ao',
        nameTr: 'Yamalo-Nenets Özerk Okrugu',
        nameRu: 'Ямало-Ненецкий автономный округ',
        aliases: ['Ямало-Ненецкий автономный округ', 'Ямало-Ненецкий АО', 'ЯНАО'],
        majorCities: ['Новый Уренгой', 'Ноябрьск', 'Салехард', 'Надым', 'Муравленко', 'Губкинский'],
      },
      {
        id: 'kurgan_oblast',
        nameTr: 'Kurgan Bölgesi',
        nameRu: 'Курганская область',
        aliases: ['Курганская область', 'Курганская обл.'],
        majorCities: ['Курган', 'Шадринск'],
      },
    ],
  },
  {
    id: 'siberian',
    nameTr: 'Sibirya Federal Bölgesi',
    nameRu: 'Сибирский федеральный округ',
    code: 'СФО',
    badgeColor: '#06B6D4', // cyan
    subjects: [
      {
        id: 'novosibirsk_oblast',
        nameTr: 'Novosibirsk Bölgesi',
        nameRu: 'Новосибирская область',
        aliases: ['Новосибирская область', 'Новосибирская обл.'],
        majorCities: ['Новосибирск', 'Бердск', 'Искитим', 'Куйбышев'],
      },
      {
        id: 'krasnoyarsk_krai',
        nameTr: 'Krasnoyarsk Krayı',
        nameRu: 'Красноярский край',
        aliases: ['Красноярский край'],
        majorCities: [
          'Красноярск', 'Норильск', 'Ачинск', 'Канск', 'Железногорск',
          'Минусинск', 'Зеленогорск', 'Лесосибирск', 'Назарово'
        ],
      },
      {
        id: 'irkutsk_oblast',
        nameTr: 'İrkutsk Bölgesi',
        nameRu: 'Иркутская область',
        aliases: ['Иркутская область', 'Иркутская обл.'],
        majorCities: ['Иркутск', 'Братск', 'Ангарск', 'Усть-Илимск', 'Усолье-Сибирское', 'Черемхово'],
      },
      {
        id: 'omsk_oblast',
        nameTr: 'Omsk Bölgesi',
        nameRu: 'Омская область',
        aliases: ['Омская область', 'Омская обл.'],
        majorCities: ['Омск', 'Тара', 'Исилькуль', 'Калачинск'],
      },
      {
        id: 'kemerovo_oblast',
        nameTr: 'Kemerovo Bölgesi (Kuzbass)',
        nameRu: 'Кемеровская область',
        aliases: ['Кемеровская область', 'Кемеровская обл.', 'Кузбасс', 'Кемеровская область - Кузбасс'],
        majorCities: [
          'Кемерово', 'Новокузнецк', 'Прокопьевск', 'Междуреченск', 'Ленинск-Кузнецкий',
          'Киселёвск', 'Юрга', 'Анжеро-Судженск', 'Белово'
        ],
      },
      {
        id: 'altai_krai',
        nameTr: 'Altay Krayı',
        nameRu: 'Алтайский край',
        aliases: ['Алтайский край'],
        majorCities: ['Барнаул', 'Бийск', 'Рубцовск', 'Новоалтайск', 'Заринск'],
      },
      {
        id: 'tomsk_oblast',
        nameTr: 'Tomsk Bölgesi',
        nameRu: 'Томская область',
        aliases: ['Томская область', 'Томская обл.'],
        majorCities: ['Томск', 'Северск', 'Стрежевой', 'Асино'],
      },
      {
        id: 'altai_republic',
        nameTr: 'Altay Cumhuriyeti',
        nameRu: 'Республика Алтай',
        aliases: ['Республика Алтай', 'Горный Алтай'],
        majorCities: ['Горно-Алтайск'],
      },
      {
        id: 'tyva_republic',
        nameTr: 'Tıva Cumhuriyeti',
        nameRu: 'Республика Тыва',
        aliases: ['Республика Тыва', 'Тыва', 'Тува'],
        majorCities: ['Кызыл'],
      },
      {
        id: 'khakassia_republic',
        nameTr: 'Hakasya Cumhuriyeti',
        nameRu: 'Республика Хакасия',
        aliases: ['Республика Хакасия', 'Хакасия'],
        majorCities: ['Абакан', 'Черногорск', 'Саяногорск'],
      },
    ],
  },
  {
    id: 'far_eastern',
    nameTr: 'Uzak Doğu Federal Bölgesi',
    nameRu: 'Дальневосточный федеральный округ',
    code: 'ДФО',
    badgeColor: '#EC4899', // pink
    subjects: [
      {
        id: 'primorsky_krai',
        nameTr: 'Primorski Krayı (Vladivostok)',
        nameRu: 'Приморский край',
        aliases: ['Приморский край', 'Приморье'],
        majorCities: ['Владивосток', 'Уссурийск', 'Находка', 'Артём', 'Арсеньев', 'Спасск-Дальний'],
      },
      {
        id: 'khabarovsk_krai',
        nameTr: 'Habarovsk Krayı',
        nameRu: 'Хабаровский край',
        aliases: ['Хабаровский край'],
        majorCities: ['Хабаровск', 'Комсомольск-на-Амуре', 'Амурск', 'Советская Гавань'],
      },
      {
        id: 'sakha_republic',
        nameTr: 'Yakutistan (Saha Cumhuriyeti)',
        nameRu: 'Республика Саха (Якутия)',
        aliases: ['Республика Саха (Якутия)', 'Якутия', 'Республика Саха'],
        majorCities: ['Якутск', 'Нерюнгри', 'Мирный', 'Ленск', 'Алдан'],
      },
      {
        id: 'buryatia_republic',
        nameTr: 'Buryatya Cumhuriyeti',
        nameRu: 'Республика Бурятия',
        aliases: ['Республика Бурятия', 'Бурятия'],
        majorCities: ['Улан-Удэ', 'Северобайкальск', 'Гусиноозёрск'],
      },
      {
        id: 'zabaykalsky_krai',
        nameTr: 'Zabaykalskiy Krayı',
        nameRu: 'Забайкальский край',
        aliases: ['Забайкальский край'],
        majorCities: ['Чита', 'Краснокаменск', 'Борзя'],
      },
      {
        id: 'amur_oblast',
        nameTr: 'Amur Bölgesi',
        nameRu: 'Амурская область',
        aliases: ['Амурская область', 'Амурская обл.'],
        majorCities: ['Благовещенск', 'Белогорск', 'Свободный', 'Тында', 'Зея'],
      },
      {
        id: 'kamchatka_krai',
        nameTr: 'Kamçatka Krayı',
        nameRu: 'Камчатский край',
        aliases: ['Камчатский край'],
        majorCities: ['Петропавловск-Камчатский', 'Елизово', 'Вилючинск'],
      },
      {
        id: 'sakhalin_oblast',
        nameTr: 'Sahalin Bölgesi',
        nameRu: 'Сахалинская область',
        aliases: ['Сахалинская область', 'Сахалинская обл.'],
        majorCities: ['Южно-Сахалинск', 'Корсаков', 'Холмск', 'Оха'],
      },
      {
        id: 'magadan_oblast',
        nameTr: 'Magadan Bölgesi',
        nameRu: 'Магаданская область',
        aliases: ['Магаданская область', 'Магаданская обл.'],
        majorCities: ['Магадан'],
      },
      {
        id: 'jewish_ao',
        nameTr: 'Yahudi Özerk Bölgesi',
        nameRu: 'Еврейская автономная область',
        aliases: ['Еврейская автономная область', 'Еврейская АО'],
        majorCities: ['Биробиджан'],
      },
      {
        id: 'chukotka_ao',
        nameTr: 'Çukotka Özerk Okrugu',
        nameRu: 'Чукотский автономный округ',
        aliases: ['Чукотский автономный округ', 'Чукотский АО'],
        majorCities: ['Анадырь', 'Билибино', 'Певек'],
      },
    ],
  },
];

export interface ResolvedGeography {
  districtId: string;
  districtNameTr: string;
  districtNameRu: string;
  districtBadgeColor: string;
  subjectId: string;
  subjectNameTr: string;
  subjectNameRu: string;
  cityName: string;
}

/**
 * Hızlı arama için indeks tabloları
 */
interface LookupMaps {
  subjectByAlias: Map<string, { district: FederalDistrictDef; subject: FederalSubjectDef }>;
  subjectByCity: Map<string, { district: FederalDistrictDef; subject: FederalSubjectDef }>;
}

let lookupCache: LookupMaps | null = null;

function getLookupMaps(): LookupMaps {
  if (lookupCache) return lookupCache;

  const subjectByAlias = new Map<string, { district: FederalDistrictDef; subject: FederalSubjectDef }>();
  const subjectByCity = new Map<string, { district: FederalDistrictDef; subject: FederalSubjectDef }>();

  FEDERAL_DISTRICTS.forEach((district) => {
    district.subjects.forEach((subject) => {
      const entry = { district, subject };

      // Subject isimleri ve alias'ları
      subjectByAlias.set(subject.id.toLowerCase(), entry);
      subjectByAlias.set(subject.nameTr.toLowerCase(), entry);
      subjectByAlias.set(subject.nameRu.toLowerCase(), entry);

      subject.aliases.forEach((alias) => {
        subjectByAlias.set(alias.toLowerCase(), entry);
        subjectByAlias.set(alias.toLowerCase().replace(/^(г\.|город|обл\.|область|край|республика)\s+/i, '').trim(), entry);
      });

      // Şehirler
      subject.majorCities?.forEach((city) => {
        subjectByCity.set(city.toLowerCase(), entry);
      });
    });
  });

  lookupCache = { subjectByAlias, subjectByCity };
  return lookupCache;
}

function cleanGeoString(input: string): string {
  if (!input) return '';
  return input
    .trim()
    .replace(/^г\.\s*/i, '')
    .replace(/^город\s+/i, '')
    .replace(/^п\.\s*/i, '')
    .replace(/^р\.п\.\s*/i, '')
    .replace(/^с\.\s*/i, '')
    .replace(/^пос\.\s*/i, '')
    .replace(/^деревня\s+/i, '')
    .trim();
}

/**
 * Gelen bölge ve şehir bilgilerini 8 Federal Bölge ve ilgili Federe Birim (Eyalet) ile eşleştirir.
 */
export function resolveRussiaGeography(rawRegion: string = '', rawCity: string = ''): ResolvedGeography {
  const { subjectByAlias, subjectByCity } = getLookupMaps();

  const cleanRegion = cleanGeoString(rawRegion);
  const cleanCity = cleanGeoString(rawCity);
  const lowerRegion = cleanRegion.toLowerCase();
  const lowerCity = cleanCity.toLowerCase();

  // 1. Moskova ve St. Petersburg Özel Durumu: Şehir ve Eyalet ayrımı
  if (lowerCity === 'москва' || lowerCity === 'moscow' || lowerRegion === 'москва' || lowerRegion === 'г. москва') {
    if (lowerRegion.includes('область') || lowerRegion.includes('обл') || (cleanCity && cleanCity.toLowerCase() !== 'москва')) {
      const entry = subjectByAlias.get('moscow_oblast')!;
      return {
        districtId: entry.district.id,
        districtNameTr: entry.district.nameTr,
        districtNameRu: entry.district.nameRu,
        districtBadgeColor: entry.district.badgeColor,
        subjectId: entry.subject.id,
        subjectNameTr: entry.subject.nameTr,
        subjectNameRu: entry.subject.nameRu,
        cityName: cleanCity || 'Moskova Bölgesi',
      };
    }

    const entry = subjectByAlias.get('moscow_city')!;
    return {
      districtId: entry.district.id,
      districtNameTr: entry.district.nameTr,
      districtNameRu: entry.district.nameRu,
      districtBadgeColor: entry.district.badgeColor,
      subjectId: entry.subject.id,
      subjectNameTr: entry.subject.nameTr,
      subjectNameRu: entry.subject.nameRu,
      cityName: 'Moskova',
    };
  }

  if (lowerCity.includes('петербург') || lowerRegion.includes('петербург') || lowerCity.includes('petersburg')) {
    if (lowerRegion.includes('ленинградская') || (cleanCity && !lowerCity.includes('петербург'))) {
      const entry = subjectByAlias.get('leningrad_oblast')!;
      return {
        districtId: entry.district.id,
        districtNameTr: entry.district.nameTr,
        districtNameRu: entry.district.nameRu,
        districtBadgeColor: entry.district.badgeColor,
        subjectId: entry.subject.id,
        subjectNameTr: entry.subject.nameTr,
        subjectNameRu: entry.subject.nameRu,
        cityName: cleanCity || 'Leningrad Bölgesi',
      };
    }

    const entry = subjectByAlias.get('saint_petersburg')!;
    return {
      districtId: entry.district.id,
      districtNameTr: entry.district.nameTr,
      districtNameRu: entry.district.nameRu,
      districtBadgeColor: entry.district.badgeColor,
      subjectId: entry.subject.id,
      subjectNameTr: entry.subject.nameTr,
      subjectNameRu: entry.subject.nameRu,
      cityName: 'St. Petersburg',
    };
  }

  // 2. Doğrudan Bölge (Region) İsminden Eşleştirme
  if (lowerRegion) {
    if (subjectByAlias.has(lowerRegion)) {
      const entry = subjectByAlias.get(lowerRegion)!;
      return {
        districtId: entry.district.id,
        districtNameTr: entry.district.nameTr,
        districtNameRu: entry.district.nameRu,
        districtBadgeColor: entry.district.badgeColor,
        subjectId: entry.subject.id,
        subjectNameTr: entry.subject.nameTr,
        subjectNameRu: entry.subject.nameRu,
        cityName: cleanCity || entry.subject.nameTr,
      };
    }

    // Kısmi eşleşme (ör. "Краснодарский" -> "Краснодарский край")
    for (const [alias, entry] of Array.from(subjectByAlias.entries())) {
      if (alias.length >= 4 && (lowerRegion.includes(alias) || alias.includes(lowerRegion))) {
        return {
          districtId: entry.district.id,
          districtNameTr: entry.district.nameTr,
          districtNameRu: entry.district.nameRu,
          districtBadgeColor: entry.district.badgeColor,
          subjectId: entry.subject.id,
          subjectNameTr: entry.subject.nameTr,
          subjectNameRu: entry.subject.nameRu,
          cityName: cleanCity || entry.subject.nameTr,
        };
      }
    }
  }

  // 3. Şehir İsminden Eşleştirme (Bölge boşsa veya şehir biliniyorsa)
  if (lowerCity) {
    if (subjectByCity.has(lowerCity)) {
      const entry = subjectByCity.get(lowerCity)!;
      return {
        districtId: entry.district.id,
        districtNameTr: entry.district.nameTr,
        districtNameRu: entry.district.nameRu,
        districtBadgeColor: entry.district.badgeColor,
        subjectId: entry.subject.id,
        subjectNameTr: entry.subject.nameTr,
        subjectNameRu: entry.subject.nameRu,
        cityName: cleanCity,
      };
    }

    // Şehir isminin bölge alias'ı içinde geçmesi
    for (const [alias, entry] of Array.from(subjectByAlias.entries())) {
      if (alias.length >= 4 && lowerCity.includes(alias)) {
        return {
          districtId: entry.district.id,
          districtNameTr: entry.district.nameTr,
          districtNameRu: entry.district.nameRu,
          districtBadgeColor: entry.district.badgeColor,
          subjectId: entry.subject.id,
          subjectNameTr: entry.subject.nameTr,
          subjectNameRu: entry.subject.nameRu,
          cityName: cleanCity,
        };
      }
    }
  }

  // 4. Eşleşmeyen / Diğer
  return {
    districtId: 'other',
    districtNameTr: 'Diğer / Tanımlanamayan Bölgeler',
    districtNameRu: 'Другие регионы',
    districtBadgeColor: '#6B727D', // subtle gray
    subjectId: 'other_subject',
    subjectNameTr: cleanRegion || cleanCity || 'Bilinmeyen Bölge',
    subjectNameRu: cleanRegion || cleanCity || 'Неизвестный регион',
    cityName: cleanCity || cleanRegion || 'Bilinmeyen Konum',
  };
}

/**
 * Hiyerarşik Dağılım Çıktı Tipleri
 */
export interface CityStat {
  cityName: string;
  orderCount: number;
  revenue: number;
  orders: RecentOrder[];
}

export interface SubjectStat {
  subjectId: string;
  subjectNameTr: string;
  subjectNameRu: string;
  orderCount: number;
  revenue: number;
  cities: CityStat[];
}

export interface DistrictStat {
  districtId: string;
  districtNameTr: string;
  districtNameRu: string;
  districtBadgeColor: string;
  orderCount: number;
  revenue: number;
  sharePercent: number;
  subjects: SubjectStat[];
}

export interface FlatCityRanking {
  cityName: string;
  subjectNameTr: string;
  districtNameTr: string;
  districtBadgeColor: string;
  orderCount: number;
  revenue: number;
  sharePercent: number;
  orders: RecentOrder[];
}

export interface GeographyAggregationResult {
  districts: DistrictStat[];
  flatCities: FlatCityRanking[];
  totalOrders: number;
  totalRevenue: number;
  locatedOrdersCount: number;
  uniqueDistrictsCount: number;
  uniqueSubjectsCount: number;
  uniqueCitiesCount: number;
  topDistrict: DistrictStat | null;
  topCity: FlatCityRanking | null;
}

/**
 * Sipariş listesini Federal Bölge -> Eyalet -> Şehir olarak 3 kademede gruplar ve istatistikleri üretir.
 */
export function aggregateOrdersByGeography(orders: RecentOrder[] = []): GeographyAggregationResult {
  const districtMap = new Map<string, {
    districtId: string;
    districtNameTr: string;
    districtNameRu: string;
    districtBadgeColor: string;
    orderCount: number;
    revenue: number;
    subjectMap: Map<string, {
      subjectId: string;
      subjectNameTr: string;
      subjectNameRu: string;
      orderCount: number;
      revenue: number;
      cityMap: Map<string, {
        cityName: string;
        orderCount: number;
        revenue: number;
        orders: RecentOrder[];
      }>;
    }>;
  }>();

  const flatCityMap = new Map<string, {
    cityName: string;
    subjectNameTr: string;
    districtNameTr: string;
    districtBadgeColor: string;
    orderCount: number;
    revenue: number;
    orders: RecentOrder[];
  }>();

  let totalOrders = 0;
  let totalRevenue = 0;
  let locatedOrdersCount = 0;

  orders.forEach((order) => {
    // cancelled siparişleri atlayalım
    if (order.status === 'cancelled') return;

    totalOrders += 1;
    const price = order.totalPrice || 0;
    totalRevenue += price;

    if (order.customerCity || order.customerRegion || (order.latitude && order.longitude)) {
      locatedOrdersCount += 1;
    }

    const geo = resolveRussiaGeography(order.customerRegion, order.customerCity);

    // 1. District Map
    let dEntry = districtMap.get(geo.districtId);
    if (!dEntry) {
      dEntry = {
        districtId: geo.districtId,
        districtNameTr: geo.districtNameTr,
        districtNameRu: geo.districtNameRu,
        districtBadgeColor: geo.districtBadgeColor,
        orderCount: 0,
        revenue: 0,
        subjectMap: new Map(),
      };
      districtMap.set(geo.districtId, dEntry);
    }
    dEntry.orderCount += 1;
    dEntry.revenue += price;

    // 2. Subject Map
    let sEntry = dEntry.subjectMap.get(geo.subjectId);
    if (!sEntry) {
      sEntry = {
        subjectId: geo.subjectId,
        subjectNameTr: geo.subjectNameTr,
        subjectNameRu: geo.subjectNameRu,
        orderCount: 0,
        revenue: 0,
        cityMap: new Map(),
      };
      dEntry.subjectMap.set(geo.subjectId, sEntry);
    }
    sEntry.orderCount += 1;
    sEntry.revenue += price;

    // 3. City Map
    let cEntry = sEntry.cityMap.get(geo.cityName);
    if (!cEntry) {
      cEntry = {
        cityName: geo.cityName,
        orderCount: 0,
        revenue: 0,
        orders: [],
      };
      sEntry.cityMap.set(geo.cityName, cEntry);
    }
    cEntry.orderCount += 1;
    cEntry.revenue += price;
    cEntry.orders.push(order);

    // 4. Flat City Map
    const cityKey = `${geo.cityName}__${geo.subjectId}`;
    let fcEntry = flatCityMap.get(cityKey);
    if (!fcEntry) {
      fcEntry = {
        cityName: geo.cityName,
        subjectNameTr: geo.subjectNameTr,
        districtNameTr: geo.districtNameTr,
        districtBadgeColor: geo.districtBadgeColor,
        orderCount: 0,
        revenue: 0,
        orders: [],
      };
      flatCityMap.set(cityKey, fcEntry);
    }
    fcEntry.orderCount += 1;
    fcEntry.revenue += price;
    fcEntry.orders.push(order);
  });

  // Hiyerarşik Dönüşüm
  const districts: DistrictStat[] = Array.from(districtMap.values())
    .map((d) => {
      const subjects: SubjectStat[] = Array.from(d.subjectMap.values())
        .map((s) => {
          const cities: CityStat[] = Array.from(s.cityMap.values()).sort(
            (a, b) => b.orderCount - a.orderCount || b.revenue - a.revenue
          );
          return {
            subjectId: s.subjectId,
            subjectNameTr: s.subjectNameTr,
            subjectNameRu: s.subjectNameRu,
            orderCount: s.orderCount,
            revenue: s.revenue,
            cities,
          };
        })
        .sort((a, b) => b.orderCount - a.orderCount || b.revenue - a.revenue);

      const sharePercent = totalOrders > 0 ? Number(((d.orderCount / totalOrders) * 100).toFixed(1)) : 0;

      return {
        districtId: d.districtId,
        districtNameTr: d.districtNameTr,
        districtNameRu: d.districtNameRu,
        districtBadgeColor: d.districtBadgeColor,
        orderCount: d.orderCount,
        revenue: d.revenue,
        sharePercent,
        subjects,
      };
    })
    .sort((a, b) => b.orderCount - a.orderCount || b.revenue - a.revenue);

  // Flat Cities
  const flatCities: FlatCityRanking[] = Array.from(flatCityMap.values())
    .map((fc) => ({
      ...fc,
      sharePercent: totalOrders > 0 ? Number(((fc.orderCount / totalOrders) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.orderCount - a.orderCount || b.revenue - a.revenue);

  const uniqueDistrictsCount = districts.filter((d) => d.districtId !== 'other').length;
  let uniqueSubjectsCount = 0;
  districts.forEach((d) => {
    uniqueSubjectsCount += d.subjects.length;
  });
  const uniqueCitiesCount = flatCities.length;

  return {
    districts,
    flatCities,
    totalOrders,
    totalRevenue,
    locatedOrdersCount,
    uniqueDistrictsCount,
    uniqueSubjectsCount,
    uniqueCitiesCount,
    topDistrict: districts[0] || null,
    topCity: flatCities[0] || null,
  };
}
