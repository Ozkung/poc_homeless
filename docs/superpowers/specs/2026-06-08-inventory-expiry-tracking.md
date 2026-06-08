# Inventory Expiry Tracking — Spec

**Date:** 2026-06-08  
**Scope:** เพิ่ม lot-level expiry date tracking ในคลังยา: รับยาต้องระบุวันหมดอายุ, แจ้งเตือน 30 วันก่อนหมดอายุ, Admin ยืนยันนำออก (soft delete) เพื่อวิเคราะห์ต้นทุน

---

## 1. Context

ระบบคลังยาปัจจุบัน (`InventoryItem` + `StockTransaction`) ไม่มีการติดตามวันหมดอายุ  
เมื่อรับยาเข้าหลาย batch วันหมดอายุต่างกัน จำเป็นต้องแยกติดตาม stock per lot  
ยาที่หมดอายุต้องนำออกจากสต็อก แต่ยังเก็บข้อมูลไว้ (soft delete) เพื่อวิเคราะห์ต้นทุนที่สูญเสีย

---

## 2. Schema Changes

### 2.1 Model ใหม่: `InventoryLot`

```prisma
model InventoryLot {
  id          String        @id @default(uuid())
  itemId      String
  item        InventoryItem @relation(fields: [itemId], references: [id])
  quantity    Int           // จำนวนที่รับเข้าครั้งแรก (immutable)
  remaining   Int           // คงเหลือ (ลดลงเมื่อมีการจ่ายออก)
  expiryDate  DateTime
  receivedAt  DateTime      @default(now())
  receiptNo   String?
  donorName   String?
  unitCost    Float?
  actorId     String        // ผู้รับยาเข้า
  actor       User          @relation("LotReceiver", fields: [actorId], references: [id])
  isExpired   Boolean       @default(false)   // soft delete flag
  expiredAt   DateTime?
  expiredById String?
  expiredBy   User?         @relation("LotExpirer", fields: [expiredById], references: [id])

  transactions StockTransaction[]
}
```

### 2.2 แก้ไข `StockTransaction`

เพิ่ม field:
```prisma
lotId  String?
lot    InventoryLot? @relation(fields: [lotId], references: [id])
```

### 2.3 แก้ไข `TransactionType` enum

เพิ่ม:
```prisma
OUT_EXPIRED   // ยาหมดอายุ — นำออกโดย admin
```

### 2.4 `InventoryItem.currentStock`

ยังคงอยู่เพื่อ backward compat และ read performance  
ต้อง sync ให้ตรงกับ `SUM(lot.remaining)` ของ lots ที่ `isExpired = false`

---

## 3. Backend

### 3.1 Endpoints

| Method | Path | เปลี่ยน/ใหม่ | สิทธิ์ |
|--------|------|-------------|--------|
| `POST` | `/inventory/:id/stock-in` | เปลี่ยน | ADMIN |
| `GET` | `/inventory/expiring` | ใหม่ | ADMIN, SUPER_ADMIN — **ต้องวางก่อน `/:id` routes ใน controller** |
| `POST` | `/inventory/lots/:lotId/expire` | ใหม่ | ADMIN, SUPER_ADMIN |
| `GET` | `/inventory/:id/lots` | ใหม่ | ADMIN, SUPER_ADMIN |

### 3.2 `POST /inventory/:id/stock-in` (เปลี่ยน)

`StockInDto` เพิ่ม:
```typescript
@IsDateString() expiryDate: string  // required, ต้องเป็นวันในอนาคต
```

Logic:
1. Validate `expiryDate > today`
2. สร้าง `InventoryLot` (`quantity = remaining = dto.quantity`, `expiryDate`, `receiptNo`, `donorName`, `unitCost`)
3. สร้าง `StockTransaction` (`type = IN_PURCHASE|IN_DONATION`, `lotId = lot.id`)
4. `item.currentStock += dto.quantity`

### 3.3 `GET /inventory/expiring`

Query: lots ที่ `expiryDate <= today + 30 วัน` AND `remaining > 0` AND `isExpired = false`  
Response:
```json
[{
  "lotId": "...",
  "itemId": "...",
  "itemName": "Metformin 500mg",
  "unit": "เม็ด",
  "remaining": 50,
  "expiryDate": "2026-07-08",
  "daysLeft": 30,
  "unitCost": 2.5
}]
```

### 3.4 `POST /inventory/lots/:lotId/expire`

Logic:
1. หา lot ตาม `lotId` และ verify อยู่ใน org เดียวกัน
2. Validate `lot.isExpired = false` และ `lot.remaining > 0`
3. ใน transaction:
   - `lot.isExpired = true`, `lot.expiredAt = now()`, `lot.expiredById = actorId`
   - สร้าง `StockTransaction` (`type = OUT_EXPIRED`, `quantity = -lot.remaining`, `lotId = lot.id`)
   - `item.currentStock -= lot.remaining`

### 3.5 `GET /inventory/:id/lots`

คืน lots ทั้งหมดของ item (active + expired) เรียงตาม `expiryDate asc`  
ใช้สำหรับ cost analysis และ history

### 3.6 `deduct` (เปลี่ยน — FIFO)

ก่อน deduct: ดึง lots ที่ `isExpired = false`, `remaining > 0` เรียง `expiryDate asc` (FIFO)  
ตัด qty ทีละ lot จนครบ:
- ถ้า `lot.remaining >= qty ที่ต้องตัด` → ตัดหมด, หยุด
- ถ้า `lot.remaining < qty ที่ต้องตัด` → ตัด lot นี้หมด, ไปต่อ lot ถัดไป
- สร้าง `StockTransaction` แยกต่อ lot (พร้อม `lotId`)
- update `lot.remaining` แต่ละ lot
- `item.currentStock -= totalQty`

---

## 4. Frontend

### 4.1 Stock-in Drawer (`inventory/page.tsx`)

เพิ่ม Form.Item `expiryDate`:
- Component: Ant Design `DatePicker` 
- Required, `disabledDate` ห้ามเลือกวันที่ผ่านมาแล้ว
- แสดงใต้ช่องจำนวน

### 4.2 Expiry Warning Banner

เรียก `GET /inventory/expiring` เมื่อโหลดหน้า  
ถ้ามีผลลัพธ์: แสดง Ant Design `Alert` (type=warning) ด้านบนตาราง  
- Icon: `<AlertTriangle />` (lucide)
- ข้อความ: "มียาใกล้หมดอายุ N รายการ"
- ปุ่ม action: "ดูรายละเอียด" → เปิด `ExpiringLotsModal`

### 4.3 `ExpiringLotsModal`

Table columns: ชื่อยา, lot remaining, หน่วย, วันหมดอายุ, เหลืออีก N วัน, ปุ่ม "นำออก"  
ปุ่ม "นำออก": Popconfirm → `POST /inventory/lots/:lotId/expire` → reload

### 4.4 ตาราง Items — badge

Column "ชื่อรายการ": ถ้า item มี lot ใกล้หมดอายุ (จากผล expiring API) แสดง `<Clock />` icon + "N lots ใกล้หมด" สีแดงใต้ชื่อ

### 4.5 Transaction History

เพิ่ม column "วันหมดอายุ": แสดง `lot.expiryDate` ถ้า transaction มี `lotId`  
Row ที่ `type = OUT_EXPIRED`: แสดง Tag สีแดง "หมดอายุ" พร้อม `<PackageX />` icon

---

## 5. Migration

```
prisma migrate dev --name add-inventory-lot-expiry
```

Migration จะ:
1. สร้าง table `InventoryLot`
2. Add column `lotId` (nullable) บน `StockTransaction`
3. Add value `OUT_EXPIRED` บน `TransactionType` enum

**Backward compat:** `lotId` เป็น nullable → transactions เก่าทั้งหมดยังคงอยู่โดยไม่มี lot

---

## 6. Cost Analysis

Query ยาที่สูญเสียจากการหมดอายุ:
```sql
SELECT item.name, lot.quantity, lot.unitCost, 
       (lot.quantity * lot.unitCost) as totalCost,
       lot.expiredAt
FROM InventoryLot lot
JOIN InventoryItem item ON lot.itemId = item.id
WHERE lot.isExpired = true
  AND item.organizationId = :orgId
ORDER BY lot.expiredAt DESC
```

---

## 7. ขอบเขต (Out of Scope)

- การแจ้งเตือนผ่าน LINE (อาจเพิ่มในภายหลัง)
- การ assign lot ให้ specific patient เมื่อ deduct
- Lot number จากผู้ผลิต (GMP lot number)
