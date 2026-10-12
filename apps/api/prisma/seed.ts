import { PrismaClient, Role, Station, TableStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const defaultPasswordHash = await bcrypt.hash('password123', 10);

  const users = [
    { name: 'System Admin', email: 'admin@tavola.com', phone: '9999900001', passwordHash: defaultPasswordHash, role: Role.ADMIN },
    { name: 'Restaurant Manager', email: 'manager@tavola.com', phone: '9999900002', passwordHash: defaultPasswordHash, role: Role.MANAGER },
    { name: 'Front Cashier', email: 'cashier@tavola.com', phone: '9999900003', passwordHash: defaultPasswordHash, role: Role.CASHIER },
    { name: 'Lead Waiter', email: 'waiter@tavola.com', phone: '9999900004', passwordHash: defaultPasswordHash, role: Role.WAITER },
    { name: 'Head Chef', email: 'chef@tavola.com', phone: '9999900005', passwordHash: defaultPasswordHash, role: Role.CHEF },
    { name: 'Demo Customer', email: 'customer@tavola.com', phone: '9999900006', passwordHash: defaultPasswordHash, role: Role.CUSTOMER },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { passwordHash: user.passwordHash, role: user.role, name: user.name, phone: user.phone },
      create: user,
    });
  }

  const categorySeed = [
    { name: 'Starters', description: 'Crispy and appetizing bites', sortOrder: 1 },
    { name: 'Main Course', description: 'Hearty curries and gravies', sortOrder: 2 },
    { name: 'Breads', description: 'Freshly baked breads', sortOrder: 3 },
    { name: 'Rice & Biryani', description: 'Fragrant rice dishes', sortOrder: 4 },
    { name: 'Chinese', description: 'Wok-fired favourites', sortOrder: 5 },
    { name: 'Beverages', description: 'Refreshing drinks', sortOrder: 6 },
    { name: 'Desserts', description: 'Sweet finishes', sortOrder: 7 },
    { name: 'Accompaniments', description: 'Sides and salads', sortOrder: 8 },
  ];

  const itemSeed = [
    { category: 'Starters', name: 'Paneer Tikka', description: 'Char-grilled cottage cheese in a spiced yogurt marinade.', imageUrl: '/menu/seed-paneer-tikka.jpg', price: 280, isVeg: true, station: Station.KITCHEN, taxPercent: 5, prepTimeMin: 15 },
    { category: 'Starters', name: 'Hara Bhara Kebab', description: 'Spinach and pea patties, crisp outside and soft inside.', imageUrl: '/menu/seed-hara-bhara-kebab.jpg', price: 240, isVeg: true, station: Station.KITCHEN, taxPercent: 5, prepTimeMin: 12 },
    { category: 'Starters', name: 'Chicken 65', description: 'Bite-sized chicken fried with curry leaves and chilli.', imageUrl: '/menu/seed-chicken-65.jpg', price: 320, isVeg: false, station: Station.KITCHEN, taxPercent: 5, prepTimeMin: 18 },
    { category: 'Starters', name: 'Crispy Corn', description: 'Sweet corn kernels tossed crisp with light spices.', imageUrl: '/menu/seed-crispy-corn.jpg', price: 210, isVeg: true, station: Station.KITCHEN, taxPercent: 5, prepTimeMin: 10 },
    { category: 'Main Course', name: 'Butter Chicken', description: 'Tandoori chicken simmered in a buttery tomato gravy.', imageUrl: '/menu/seed-butter-chicken.jpg', price: 420, isVeg: false, station: Station.KITCHEN, taxPercent: 5, prepTimeMin: 20 },
    { category: 'Main Course', name: 'Paneer Butter Masala', description: 'Cottage cheese cubes in a rich, mildly sweet tomato gravy.', imageUrl: '/menu/seed-paneer-butter-masala.jpg', price: 360, isVeg: true, station: Station.KITCHEN, taxPercent: 5, prepTimeMin: 18 },
    { category: 'Main Course', name: 'Dal Makhani', description: 'Black lentils slow-cooked with butter and cream.', imageUrl: '/menu/seed-dal-makhani.jpg', price: 290, isVeg: true, station: Station.KITCHEN, taxPercent: 5, prepTimeMin: 15 },
    { category: 'Main Course', name: 'Kadai Chicken', description: 'Chicken cooked with peppers, onion and roasted coriander seeds.', imageUrl: '/menu/seed-kadai-chicken.jpg', price: 390, isVeg: false, station: Station.KITCHEN, taxPercent: 5, prepTimeMin: 22 },
    { category: 'Breads', name: 'Butter Naan', description: 'Soft leavened flatbread finished with melted butter.', imageUrl: '/menu/seed-butter-naan.jpg', price: 60, isVeg: true, station: Station.KITCHEN, taxPercent: 5, prepTimeMin: 8 },
    { category: 'Breads', name: 'Garlic Naan', description: 'Naan topped with fresh garlic and coriander.', imageUrl: '/menu/seed-garlic-naan.jpg', price: 75, isVeg: true, station: Station.KITCHEN, taxPercent: 5, prepTimeMin: 8 },
    { category: 'Breads', name: 'Tandoori Roti', description: 'Whole-wheat flatbread baked in the tandoor.', imageUrl: '/menu/seed-tandoori-roti.jpg', price: 35, isVeg: true, station: Station.KITCHEN, taxPercent: 5, prepTimeMin: 5 },
    { category: 'Breads', name: 'Cheese Stuffed Naan', description: 'Naan stuffed with melting cheese, baked in the tandoor.', imageUrl: '/menu/seed-cheese-stuffed-naan.jpg', price: 95, isVeg: true, station: Station.KITCHEN, taxPercent: 5, prepTimeMin: 10 },
    { category: 'Rice & Biryani', name: 'Hyderabadi Chicken Biryani', description: 'Long-grain rice layered with spiced chicken and slow-cooked on dum.', imageUrl: '/menu/seed-hyderabadi-chicken-biryani.jpg', price: 380, isVeg: false, station: Station.KITCHEN, taxPercent: 5, prepTimeMin: 25 },
    { category: 'Rice & Biryani', name: 'Veg Dum Biryani', description: 'Fragrant rice and vegetables cooked together on dum.', imageUrl: '/menu/seed-veg-dum-biryani.jpg', price: 310, isVeg: true, station: Station.KITCHEN, taxPercent: 5, prepTimeMin: 20 },
    { category: 'Rice & Biryani', name: 'Jeera Rice', description: 'Basmati rice tempered with toasted cumin seeds.', imageUrl: '/menu/seed-jeera-rice.jpg', price: 180, isVeg: true, station: Station.KITCHEN, taxPercent: 5, prepTimeMin: 10 },
    { category: 'Rice & Biryani', name: 'Steamed Rice', description: 'Plain steamed basmati rice.', imageUrl: '/menu/seed-steamed-rice.jpg', price: 140, isVeg: true, station: Station.KITCHEN, taxPercent: 5, prepTimeMin: 8 },
    { category: 'Chinese', name: 'Veg Hakka Noodles', description: 'Stir-fried noodles with crisp vegetables and soy.', imageUrl: '/menu/seed-veg-hakka-noodles.jpg', price: 230, isVeg: true, station: Station.KITCHEN, taxPercent: 5, prepTimeMin: 15 },
    { category: 'Chinese', name: 'Chicken Manchurian Gravy', description: 'Chicken fritters in a glossy garlic-soy gravy.', imageUrl: '/menu/seed-chicken-manchurian-gravy.jpg', price: 330, isVeg: false, station: Station.KITCHEN, taxPercent: 5, prepTimeMin: 18 },
    { category: 'Chinese', name: 'Chilli Paneer Dry', description: 'Crisp paneer tossed with chilli, onion and capsicum.', imageUrl: '/menu/seed-chilli-paneer-dry.jpg', price: 290, isVeg: true, station: Station.KITCHEN, taxPercent: 5, prepTimeMin: 15 },
    { category: 'Chinese', name: 'Steamed Veg Momos', description: 'Hand-shaped dumplings filled with seasoned vegetables.', imageUrl: '/menu/seed-steamed-veg-momos.jpg', price: 180, isVeg: true, station: Station.KITCHEN, taxPercent: 5, prepTimeMin: 15 },
    { category: 'Beverages', name: 'Fresh Lime Soda', description: 'Chilled lime soda, sweet or salted.', imageUrl: '/menu/seed-fresh-lime-soda.jpg', price: 90, isVeg: true, station: Station.BAR, taxPercent: 5, prepTimeMin: 5 },
    { category: 'Beverages', name: 'Mango Lassi', description: 'Thick yogurt drink blended with ripe mango.', imageUrl: '/menu/seed-mango-lassi.jpg', price: 120, isVeg: true, station: Station.BAR, taxPercent: 5, prepTimeMin: 5 },
    { category: 'Beverages', name: 'Cold Coffee with Ice Cream', description: 'Iced coffee topped with a scoop of vanilla.', imageUrl: '/menu/seed-cold-coffee-with-ice-cream.jpg', price: 150, isVeg: true, station: Station.BAR, taxPercent: 5, prepTimeMin: 7 },
    { category: 'Beverages', name: 'Masala Chai', description: 'Tea simmered with milk, ginger and whole spices.', imageUrl: '/menu/seed-masala-chai.jpg', price: 50, isVeg: true, station: Station.BAR, taxPercent: 5, prepTimeMin: 5 },
    { category: 'Desserts', name: 'Gulab Jamun (2 pcs)', description: 'Warm milk dumplings soaked in cardamom sugar syrup.', imageUrl: '/menu/seed-gulab-jamun--2-pcs-.jpg', price: 110, isVeg: true, station: Station.KITCHEN, taxPercent: 5, prepTimeMin: 5 },
    { category: 'Desserts', name: 'Rasmalai (2 pcs)', description: 'Soft cheese discs in saffron-thickened milk.', imageUrl: '/menu/seed-rasmalai--2-pcs-.jpg', price: 140, isVeg: true, station: Station.KITCHEN, taxPercent: 5, prepTimeMin: 5 },
    { category: 'Desserts', name: 'Sizzling Brownie with Ice Cream', description: 'Warm chocolate brownie served with vanilla ice cream.', imageUrl: '/menu/seed-sizzling-brownie-with-ice-cream.jpg', price: 220, isVeg: true, station: Station.KITCHEN, taxPercent: 5, prepTimeMin: 10 },
    { category: 'Accompaniments', name: 'Boondi Raita', description: 'Yoghurt with roasted cumin and tiny gram-flour pearls.', imageUrl: '/menu/seed-boondi-raita.jpg', price: 90, isVeg: true, station: Station.KITCHEN, taxPercent: 5, prepTimeMin: 5 },
    { category: 'Accompaniments', name: 'Green Salad', description: 'Fresh cucumber, tomato and onion with lemon.', imageUrl: '/menu/seed-green-salad.jpg', price: 80, isVeg: true, station: Station.KITCHEN, taxPercent: 5, prepTimeMin: 5 },
    { category: 'Accompaniments', name: 'Roasted Masala Papad', description: 'Roasted lentil crisp sprinkled with onion masala.', imageUrl: '/menu/seed-roasted-masala-papad.jpg', price: 40, isVeg: true, station: Station.KITCHEN, taxPercent: 5, prepTimeMin: 3 },
  ];

  for (const category of categorySeed) {
    await prisma.category.upsert({
      where: { name: category.name },
      update: { description: category.description, sortOrder: category.sortOrder },
      create: category,
    });
  }

  for (const item of itemSeed) {
    const category = await prisma.category.findUnique({ where: { name: item.category } });
    if (!category) continue;

    await prisma.menuItem.upsert({
      where: { id: `seed-${item.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}` },
      update: {
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        price: item.price,
        categoryId: category.id,
        isVeg: item.isVeg,
        station: item.station,
        taxPercent: item.taxPercent,
        prepTimeMin: item.prepTimeMin,
        isAvailable: true,
      },
      create: {
        id: `seed-${item.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        price: item.price,
        categoryId: category.id,
        isVeg: item.isVeg,
        station: item.station,
        taxPercent: item.taxPercent,
        prepTimeMin: item.prepTimeMin,
        isAvailable: true,
      },
    });
  }

  const ingredientSeed = [
    { name: 'Paneer', unit: 'kg', stockQty: 10, reorderLevel: 3 },
    { name: 'Chicken', unit: 'kg', stockQty: 15, reorderLevel: 4 },
    { name: 'Rice', unit: 'kg', stockQty: 20, reorderLevel: 5 },
    { name: 'Tomato', unit: 'kg', stockQty: 8, reorderLevel: 3 },
    { name: 'Onion', unit: 'kg', stockQty: 12, reorderLevel: 4 },
    { name: 'Capsicum', unit: 'kg', stockQty: 7, reorderLevel: 2 },
    { name: 'Curd', unit: 'kg', stockQty: 5, reorderLevel: 2 },
    { name: 'Basmati Rice', unit: 'kg', stockQty: 18, reorderLevel: 5 },
    { name: 'Naan Dough', unit: 'kg', stockQty: 6, reorderLevel: 2 },
    { name: 'Paneer Cubes', unit: 'kg', stockQty: 8, reorderLevel: 3 },
    { name: 'Lemon', unit: 'pcs', stockQty: 30, reorderLevel: 10 },
    { name: 'Mint', unit: 'bunch', stockQty: 8, reorderLevel: 2 },
    { name: 'Milk', unit: 'litres', stockQty: 12, reorderLevel: 4 },
    { name: 'Ice Cream', unit: 'kg', stockQty: 5, reorderLevel: 2 },
    { name: 'Salad Mix', unit: 'kg', stockQty: 5, reorderLevel: 2 },
  ];

  for (const ingredient of ingredientSeed) {
    await prisma.ingredient.upsert({
      where: { name: ingredient.name },
      update: { unit: ingredient.unit, stockQty: ingredient.stockQty, reorderLevel: ingredient.reorderLevel },
      create: ingredient,
    });
  }

  for (let index = 1; index <= 10; index += 1) {
    const capacity = [2, 2, 4, 4, 6, 2, 4, 4, 6, 8][index - 1];
    const qrToken = `tbl-${String(index).padStart(2, '0')}`;

    await prisma.diningTable.upsert({
      where: { number: index },
      update: { capacity, qrToken, status: TableStatus.FREE },
      create: { number: index, capacity, qrToken, status: TableStatus.FREE },
    });
  }

  console.log('Users seeded.');
  console.log('Menu categories and items seeded.');
  console.log('Dining tables seeded.');
  console.log('Ingredients seeded.');
  console.log('Demo logins:');
  console.log('admin@tavola.com / password123');
  console.log('manager@tavola.com / password123');
  console.log('cashier@tavola.com / password123');
  console.log('waiter@tavola.com / password123');
  console.log('chef@tavola.com / password123');
  console.log('customer@tavola.com / password123');
  console.log('Table 1 QR URL: /t/tbl-01');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
