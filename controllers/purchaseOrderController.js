// import module `database` from `../models/db.js`
const db = require('../models/db.js');

const Items = require('../models/ItemsModel.js');

const ItemStatus = require('../models/ItemStatusModel.js')

const Suppliers = require('../models/SuppliersModel.js');

const PurchaseOrderStatus = require('../models/PurchaseOrderStatusModel.js');

const Units = require('../models/UnitsModel.js');

const Purchases = require('../models/PurchasesModel.js');

const PurchasedItems = require('../models/PurchasedItemsModel.js');

const ItemSuppliers = require('../models/ItemSuppliersModel.js')

const path = require('path');

const fs = require('fs');

const PizZip = require("pizzip");

const Docxtemplater = require("docxtemplater");

const {ILovePDFApi} = require('@ilovepdf/ilovepdf-js')


const purchaseOrderController = {

	getPurchaseOrderList: function(req, res) {


		async function getPurchaseInfo (result) {
			var purchases = [];
			for (var i=0; i<result.length; i++) {
				var purchase = {
					poID: result[i]._id,
					date: result[i].date.toLocaleString('en-US'), 
					poNumber: result[i].purchaseOrderNumber,
					supplier: await getSupplierName(result[i].supplierID),
					amount: "P " + parseFloat(result[i].total).toFixed(2), 
					status: await getPurchaseOrderStatus(result[i].statusID)
				};
				purchases.push(purchase);
			}
			var statuses = await getAllPurchaseOrderStatus();
			res.render('purchaseOrderList', {purchases, statuses});
		}

		db.findMany(Purchases, {statusID: {$ne:"61a632b4f6780b76e175421f"}}, 'date purchaseOrderNumber supplierID statusID total', function(result) {
			getPurchaseInfo(result);
		});
		
	},

	getCreateNewPurchaseOrder: function(req, res) {
		db.findMany(Purchases, {}, '', function(result) {
			var length = result.length - 1;
			var newPONumber; 

			//no PO in the db yet
			if (length == -1)
				newPONumber = 1;
			else
				newPONumber = result[length].purchaseOrderNumber+1;

			res.render('newPO', {newPONumber});
		});
		
	},

	getItems: function(req, res) {

		function getItems(supplierID) {
			return new Promise((resolve, reject) => {
				db.findMany(ItemSuppliers, {supplierID:supplierID}, 'itemID', function(result) {
					resolve (result)
				})
			})
		}

		//source for regex
		//https://blog.sessionstack.com/how-javascript-works-regular-expressions-regexp-e187e9082913

		async function getFilteredItems() {
			var supplierID = await getSupplierID(req.query.supplier)
			var items = await getItems(supplierID)
			var formattedResults = []
			var query = new RegExp(req.query.query, 'i')
			var itemNames = []

			for (var i=0; i<items.length; i++){
				var itemName = await getItemDescription(items[i].itemID)
				itemNames.push(itemName);
			}

			for (var i=0; i<itemNames.length; i++) {
				if (query.test(itemNames[i])) {
					var formattedResult = {
						label: await getItemDescription(items[i].itemID),
						value: await getItemDescription(items[i].itemID)
					}
					formattedResults.push(formattedResult)
				}
			}
			res.send(formattedResults)
		}
		
		getFilteredItems();
	},

	getItemUnit: function(req, res) {
		db.findOne (Items, {itemDescription:req.query.itemDesc, informationStatusID:"618a7830c8067bf46fbfd4e4"}, 'unitID', function(result) {
			db.findOne(Units, {_id: result.unitID}, 'unit', function (result2) {
				res.send(result2.unit);
			});
		});
	},

	previousPONumber: function(req, res) {
		db.findMany(Purchases, {}, '', function(result) {

			if (result.length == 0)
				res.send("none");
			else {
				var length = result.length-1;
				var prevPoNumber = result[length].purchaseOrderNumber.toString();
				res.send(prevPoNumber);
			}
		});
	},

	saveNewPO: function(req, res) {

		async function saveItems(purchaseID, items) {
			for (var i=0; i<items.length; i++) {
				items[i].purchaseOrderID = purchaseID;
				items[i].itemID = await getItemID(items[i].itemDesc);
				items[i].unitID = await getUnitID(items[i].unit);
			}

			db.insertMany(PurchasedItems, items, function(flag) {
				if (flag) {
					res.sendStatus(200)
				}
			});
		}

		var items = JSON.parse(req.body.itemsString);
		var date = req.body.date;
		var purchase = {
			purchaseOrderNumber: req.body.poNumber,
			supplierID: "6190f42e208a6e6950bd0023",
			employeeID: "6193c08eea47cc5edfb484c5",
			date: date,
			vat: 0,
			subtotal: 0,
			total: 0,
			statusID: "618f650546c716a39100a809"
		};
		var purchaseID;
		db.insertOneResult(Purchases, purchase, function(result) {
			purchaseID = result._id;
			saveItems(purchaseID, items);
		});
	},

	getPurchaseOrder: function(req, res) {

		function getSupplierInfo(supplierID) {
			return new Promise((resolve, reject) => {
				db.findOne(Suppliers, {_id:supplierID}, 'name contactPerson number address', function(result) {
					resolve(result);
				});
			});
		}

		function getPOInfo (poID) {
			return new Promise((resolve, reject) => {
				db.findOne(Purchases, {_id:poID}, 'purchaseOrderNumber employeeID date dateReceived subtotal vat total', function (result) {
					resolve(result);
				});
			});
		}

		function getReceivedItems(purchaseID) {
			return new Promise((resolve, reject) => {
				db.findMany(PurchasedItems, {purchaseOrderID: purchaseID}, 'itemID unitID unitPrice quantity amount quantityReceived', function(result) {
					resolve(result);
				});
			});
		}

		async function getItems(purchaseInfo) {
			var items  = await getCurrentPOItems(purchaseInfo._id);
			for (var i=0; i<items.length; i++) {
				items[i].itemDescription = await getItemDescription(items[i].itemID);
				items[i].unitName = await getSpecificUnit(items[i].unitID);
			}

			var poInfo = purchaseInfo
			var supplier = await getSupplierInfo(poInfo.supplierID);
			poInfo.fdateMade = poInfo.date.toLocaleString('en-US');
			poInfo.employeeName = await getEmployeeName(poInfo.employeeID);

			//new po
			if (purchaseInfo.statusID == "618f650546c716a39100a809") {
				var newPO = purchaseInfo.statusID;
				res.render('viewPO', {items, poInfo, newPO, supplier});
			}
			//sent
			else if (purchaseInfo.statusID == "618f652746c716a39100a80a") {
				var released = purchaseInfo.statusID
				res.render('viewPO', {items, poInfo, released, supplier});
			}

			//incomplete
			else if (purchaseInfo.statusID == "618f653746c716a39100a80b") {
				var incomplete = purchaseInfo.statusID;
				res.render('viewPO', {items, poInfo, incomplete, supplier});
			}

			//received
			else if (purchaseInfo.statusID == "618f654646c716a39100a80c") {
				var poInfo = await getPOInfo (purchaseInfo._id);
				poInfo.fdateMade = poInfo.date.toLocaleString('en-US');
				poInfo.fdateReceived = poInfo.dateReceived.toLocaleString('en-US');
				poInfo.employeeName =  await getEmployeeName(poInfo.employeeID)

				items = await getReceivedItems(purchaseInfo._id);

				for (var i=0; i<items.length; i++) {
					items[i].itemDescription = await getItemDescription(items[i].itemID);
					items[i].unitName = await getSpecificUnit(items[i].unitID);
				}
				
				var received = purchaseInfo.statusID;

				poInfo.fvat = "P " + parseFloat(poInfo.vat).toFixed(2);
				poInfo.fsubtotal = "P " + parseFloat(poInfo.subtotal).toFixed(2);
				poInfo.ftotal = "P " + parseFloat(poInfo.total).toFixed(2);
				res.render('viewPO', {supplier, items, poInfo, received});
			}
		}

		db.findOne(Purchases, {_id:req.params.poID}, '_id purchaseOrderNumber supplierID employeeID date statusID', function(result) {
			getItems(result);
		});
	},

	generatePurchaseOrder: function(req, res) {

		function getLowItems() {
			return new Promise((resolve, reject) => {
				db.findMany(Items, {statusID:"618b32205f628509c592daab", informationStatusID:"618a7830c8067bf46fbfd4e4"}, '_id itemDescription EOQ unitID', function(result) {
					resolve (result);
				});
			});
		}

		async function getItems() {
			var items = await getLowItems();


			for (var i=0; i<items.length; i++) {
				items[i].unit = await getSpecificUnit(items[i].unitID);

				var temp_suppliers = await getItemSuppliers(items[i]._id);
				var suppliers = []
				for (var j=0; j<temp_suppliers.length; j++) {
					var supplier = {
						_id: temp_suppliers[j].supplierID,
						name: await getSupplierName(temp_suppliers[j].supplierID)
					}
					suppliers.push(supplier)
				}

				items[i].suppliers = suppliers
			}

			res.render('generatePO', {items});
		}

		getItems();
		
	},

	saveGeneratePurchaseOrder: function(req, res) {
		
		function getUniqueSuppliers(items) {
			var suppliers = [];

			for (var a=0; a<items.length; a++) {
				//array does not have supplier
				if (!(suppliers.includes(items[a].supplier))) 
					suppliers.push(items[a].supplier);
			}
			return suppliers;
		}

		function savePurchase(purchase, poItems) {
			return new Promise ((resolve, reject) => {
				db.insertOneResult(Purchases, purchase, function(result) {
					resolve(result._id);
				});
			});
		}

		async function savePO(dateToday, items) {
			var uniqueSuppliers = getUniqueSuppliers(items);

			for (var i=0; i<uniqueSuppliers.length; i++) {

				var poItems = [];
				for (var j=0; j<items.length; j++) {
					if (uniqueSuppliers[i] == items[j].supplier) {
						var item = {
							itemID: await getItemID(items[j].itemDescription),
							unitID: await getUnitID(items[j].unit),
							quantity: items[j].quantity
						};
						poItems.push(item);
					}
				}

				var purchase = {
					purchaseOrderNumber: await getPONumber(),
					supplierID: uniqueSuppliers[i],
					employeeID:"6193c0e4ea47cc5edfb484d2",
					date: dateToday,
					vat: 0,
					subtotal: 0,
					total: 0,
					statusID: "618f650546c716a39100a809"
				};
				
				var purchaseID = await savePurchase(purchase)
				for (var k=0; k<poItems.length; k++)
						poItems[k].purchaseOrderID = purchaseID;

				db.insertMany(PurchasedItems, poItems, function(flag) {
					if (flag) { }
				});
			}
			res.sendStatus(200)
			//res.redirect('/purchaseOrderList');
		}
		//------END OF FUNCTIONS-------


		var purchaseItems = JSON.parse(req.body.purchaseString);
		var dateToday = new Date();

		savePO(dateToday, purchaseItems);
	},

	editPO: function(req, res) {

		async function getItems(purchaseInfo, statusID) {
			var items  = await getCurrentPOItems(purchaseInfo._id);
			for (var i=0; i<items.length; i++) {
				items[i].itemDescription = await getItemDescription(items[i].itemID);
				items[i].unitName = await getSpecificUnit(items[i].unitID);
			}
			var supplier = await getSpecificSupplier(purchaseInfo.supplierID);

			var units = await getUnits();
			var inventoryTypes = await getInventoryTypes();

			if (statusID == "618f650546c716a39100a809") {
				var newPO = statusID;
				//renders delete button and probably cancel PO button
				res.render('editPO', {items, purchaseInfo, supplier, units, inventoryTypes,newPO});
			}
			else if (statusID == "618f652746c716a39100a80a") {
				var released = statusID;
				//renders input for price 
				res.render('editPO', {items, purchaseInfo, supplier, units, inventoryTypes, released})
			}
		
		}

		db.findOne(Purchases, {_id:req.params.poID}, '_id purchaseOrderNumber supplierID date statusID', function(result) {
			getItems(result, result.statusID)
		})
	},

	getSupplierName: function(req, res) {
		db.findMany (Suppliers, {informationStatusID:"618a7830c8067bf46fbfd4e4", name:{$regex:req.query.query, $options:'i'}}, 'name', function(result){
			var formattedResults = [];
			//reason for the for loop: https://stackoverflow.com/questions/5077409/what-does-autocomplete-request-server-response-look-like
			for (var i=0; i<result.length; i++) {
				var formattedResult = {
					label: result[i].name,
					value: result[i].name
				};
				formattedResults.push(formattedResult);
			}
			res.send(formattedResults)
		})
	},

	getSupplierInformation: function(req, res) {
		db.findOne(Suppliers, {name:req.query.supplierName, informationStatusID:"618a7830c8067bf46fbfd4e4"}, 'name contactPerson number address', function(result) {
			res.send(result)
		})
	},

	isSold: function(req, res) {
		async function check() {
			var itemID = await getItemID (req.query.itemDesc);
			var supplierID = await getSupplierID(req.query.supplierName)


			db.findOne (ItemSuppliers, {itemID:itemID, supplierID:supplierID}, '_id', function(result) {
				if (result == null)
					res.send("not sold")
				else
					res.send("sold")
			})
		}

		check();
	},

	//update function for new PO, add new items, delete items
	updatePOItems: function(req, res) {

		function updatePurchaseItems(itemID, newQuantity, poID) {
			db.updateOne(PurchasedItems, {purchaseOrderID: poID, itemID:itemID}, {quantity: newQuantity}, function(result) {

			})
		}

		function removeItem (itemID, poID) {
			db.deleteOne(PurchasedItems, {purchaseOrderID: poID, itemID:itemID}, function(flag) {
				if (flag) { }
			})
		}

		function addItem (item, poID) {
			item.purchaseOrderID = poID
			db.insertOne(PurchasedItems, item, function(flag) {
				if (flag) { }
			})
		}

		async function updatePO(items, poID) {
			var temp_currentPOItems = await getCurrentPOItems(poID);
			var currentPOItems = []

			for (var i=0; i<temp_currentPOItems.length; i++) {
				var poItem = {
					itemID: temp_currentPOItems[i].itemID,
					unitID: temp_currentPOItems[i].unitID,
					quantity: temp_currentPOItems[i].quantity
				}
				currentPOItems.push(poItem);
			}

			
			console.log("BEFORE PROCESSING")
			console.log("ITEMS")
			console.log(items)
			console.log("CURRENT PO ITEMS")
			console.log(currentPOItems)

			for (var i=0; i<items.length; i++)
				items[i].itemID = await getItemID(items[i].itemDesc)

			for (var i=0; i<currentPOItems.length; i++) {
				currentPOItems[i].checked = false
				
				for (var j=0; j<items.length; j++) {
					items[j].checked = false

					if (currentPOItems[i].itemID == items[j].itemID) {
						//items not chcked in currentPO means it was removed
						currentPOItems[i].checked = true
						//items not checked in items means it was added
						items[j].checked = true
						//quantty was updated
						if (currentPOItems[i].quantity != items[j].quantity)
							updatePurchaseItems(items[j].itemID, items[j].quantity, poID)
					} 
				}
			}

			console.log('AFTER CHECKING')
			console.log('ITEMS')
			console.log(items)
			console.log('currentPOItems')
			console.log(currentPOItems)

			for (var i=0; i<currentPOItems.length; i++) {
				if (!currentPOItems[i].checked) {
					removeItem (currentPOItems[i].itemID, poID)
				}
			}

			for (var i=0; i<items.length; i++) {
				if (!items[i].checked) {
					items[i].unitID = await getUnitID(items[i].unit)
					addItem (items[i], poID)
				}
			}

			var supplierID = await getSupplierID(req.body.supplierName)
			db.updateOne(Purchases, {_id:poID}, {supplierID:supplierID}, function(result) {

			})

			res.sendStatus(200)
		}

		//-------END OF FUNCTIONS--------

		var items = JSON.parse(req.body.itemsString);
		var poID = req.body.poID;
		updatePO(items, poID);
	},

	updatePOStatus: function(req, res) {
		db.updateOne(Purchases, {_id:req.body.poID}, {statusID:"618f652746c716a39100a80a"},function(flag) {
			if (flag) {
				res.sendStatus(200)
			}
		})
	},

	//update function for sent PO, update with prices and quantity received
	updatePOWithPrice: function(req, res) {

		function updatePOItemInfo (poID, item) {
			var unitPrice = parseFloat(item.price)
			var amount  = parseFloat(item.amount)
			db.updateOne (PurchasedItems, {purchaseOrderID:poID, itemID:item.itemID}, {$set: {unitPrice:unitPrice, amount:amount, quantityReceived: item.quantityReceived}}, function(flag) {
				if (flag) { }
			})
		}

		//----FUNCTIONS FOR UPDATE INVENTORY QUANTITY
		function getCurrentQuantity(itemID) {
			return new Promise((resolve, reject) => {
				db.findOne(Items, {_id:itemID, informationStatusID:"618a7830c8067bf46fbfd4e4"}, 'quantityAvailable', function(result) {
					resolve(result.quantityAvailable);
				})
			})
		}

		function getReorderLevel (itemID) {
			return new Promise((resolve, reject) => {
				db.findOne(Items, {_id:itemID, informationStatusID:"618a7830c8067bf46fbfd4e4"}, 'reorderLevel', function(result) {
					resolve(result.reorderLevel);
				})
			})
		}

		function updateQuantity(itemID, newQuantity) {
			return new Promise((resolve, reject) => {
				db.updateOne(Items, {_id:itemID, informationStatusID:"618a7830c8067bf46fbfd4e4"}, {quantityAvailable:newQuantity}, function(flag) {

				})
			})
		}

		function updateQuantityInStock(itemID, newQuantity) {
			return new Promise((resolve, reject) => {
				db.updateOne(Items, {_id:itemID, informationStatusID:"618a7830c8067bf46fbfd4e4"}, {$set:{quantityAvailable:newQuantity, statusID:"618b6c82a07cb824ce7bfca2"}}, function(flag) {

				})
			})
		}

		async function updateInventory(itemID, quantityReceived) {
			var reorderLevel = await getReorderLevel(itemID) 

			var currentQuantity = await getCurrentQuantity(itemID);
			var newQuantity = parseInt(currentQuantity) + parseInt (quantityReceived)
			
			//item is still low in stock
			if (reorderLevel > newQuantity)
				updateQuantity (itemID, newQuantity)
			else
				updateQuantityInStock(itemID, newQuantity)
		}
		//------END OF FUNCTIONS FOR UPDATING INVENTORY QUANTITY------


		//------NEED NEW PO FUNCTIONS-------

		function getPOSupplier(poID) {
			return new Promise((resolve, reject) => {
				db.findOne(Purchases, {_id:poID}, 'supplierID', function(result) {
					resolve(result.supplierID);
				})
			})
		}

		async function newPO (supplierID, poNumber) {
			return new Promise((resolve, reject) => {
				var purchase = {
					purchaseOrderNumber: poNumber,
					supplierID: supplierID,
					employeeID: "6193c0e4ea47cc5edfb484d2",
					date: new Date(),
					statusID: "618f650546c716a39100a809",
					total: 0
				}
				db.insertOneResult(Purchases, purchase, function(result) {
					resolve(result._id)
				})
			})
		}

		//------END OF NEED NEW PO FUNCTION------



		async function updatePO(items, poID) {
			var needNewPO = false;
			var temp_newPOItems = []
			var currentPOItems = await getCurrentPOItems(poID);


			for (var i=0; i<currentPOItems.length; i++) {
				if (items[i].price!="" && items[i].quantity!="") {
					items[i].itemID = await getItemID(items[i].itemDesc)
					//update po price and quantity received
					updatePOItemInfo(poID, items[i]);
					//add quantity to inventory
					updateInventory (items[i].itemID, items[i].quantityReceived);
				}
				else {
					needNewPO = true;
					var newPOItem = {
						itemID: await getItemID(items[i].itemDesc),
						unitID: await getItemUnit(items[i].itemDesc),
						quantity: currentPOItems[i].quantity
					}
					temp_newPOItems.push(newPOItem)
				}
			}

			for (var i=0; i<currentPOItems.length; i++) {
				//quantity received is less that ordered quantity
				if (items[i].quantityReceived < currentPOItems[i].quantity) {
					needNewPO = true
					var newPOItem = {
						itemID: await getItemID(items[i].itemDesc),
						unitID: await getItemUnit(items[i].itemDesc),
						quantity: currentPOItems[i].quantity - items[i].quantityReceived
					}
					temp_newPOItems.push(newPOItem)
				}
			}


			db.updateOne(Purchases, {_id: poID}, {statusID: "618f654646c716a39100a80c"}, function (flag) {
			})

			if (needNewPO)  {
				
				var supplierID = await getPOSupplier(poID) 
				var poNumber = await getPONumber()
				var newPOID = await newPO (supplierID, poNumber)
				var newPOItems = []

				for (var i=0; i<temp_newPOItems.length; i++) {
					var newPOItem = {
						purchaseOrderID: newPOID,
						itemID: temp_newPOItems[i].itemID,
						unitID: temp_newPOItems[i].unitID,
						quantity: temp_newPOItems[i].quantity
					}
					newPOItems.push(newPOItem)
				}

				db.insertMany(PurchasedItems, newPOItems, function(flag) {
					if (flag) 
						res.sendStatus(200)
				})
			}
			else
				res.sendStatus(200)
		}

		//-------END OF FUNCTIONS-------
		
		var items = JSON.parse(req.body.itemsString);
		var poID = req.body.poID;
		var subtotal = parseFloat(req.body.subtotal);
		var vat  = parseFloat(req.body.vat);
		var total = parseFloat(req.body.total);
		var dateReceived = new Date();

		db.updateOne(Purchases, {_id:poID}, {$set: {dateReceived: dateReceived, subtotal:subtotal, vat: vat, total:total}}, function(flag) {
				updatePO(items, poID);
		})
	},

	getItemSuppliers: function(req, res) {

		async function getSuppliers() {
			var itemID = await getItemID(req.query.itemDesc)
			var temp_suppliers = await getItemSuppliers(itemID)
			
			var suppliers = []		
			for (var i=0; i<temp_suppliers.length; i++) {
				var supplier = {
					id:temp_suppliers[i].supplierID,
					name: await getSupplierName(temp_suppliers[i].supplierID)
				}
				suppliers.push(supplier)
			}
			res.send(suppliers)
		}

		getSuppliers()
	},

	deletePO: function(req, res) {
		db.updateOne(Purchases, {_id: req.body.poID}, {statusID:"61a632b4f6780b76e175421f"}, function(flag) {
			if (flag) {
				res.sendStatus(200)
			}
		})
	},

	cancelPO: function(req, res) {
		db.updateOne(Purchases, {_id: req.body.poID}, {statusID:"618f654d46c716a39100a80d"}, function(flag) {
			if (flag) {
				res.sendStatus(200)
			}
		})
	},

	generatePDF: function(req, res) {

		var supplierInfo = JSON.parse(req.query.supplierString)
		var items = JSON.parse(req.query.poItemsString)

		var fsupplierName

		for (var i=0; i<supplierInfo.name.length; i++)
			fsupplierName = supplierInfo.name.replace(" ", "_")

		var temp_fDate0 = req.query.date.split(",");
		var temp_fDate = temp_fDate0[0].split("/")
		var temp_fTime = temp_fDate0[1].split(":")
		var fDate = ""	
		var fTime = ""
		for (var i=0; i<temp_fDate.length; i++)
			fDate += temp_fDate[i] + "_"
		for (var i=0; i<temp_fTime.length-1	; i++)
			fTime += temp_fTime[i] + "_"


		var fileName = fDate + fTime + fsupplierName

		//for creating purchase order in docx
		// Load the docx file as binary content
		const content = fs.readFileSync(
		    path.resolve("files", "po_template.docx"), "binary"
		);

		const zip = new PizZip(content);
		
		const doc = new Docxtemplater(zip, {
		    paragraphLoop: true,
		    linebreaks: true,
		});

		// render the document
		doc.render({
			poNumber: req.query.poNumber,
			date: temp_fDate0[0],
		   	supplier_name: supplierInfo.name,
		    contact_person: supplierInfo.contactPerson,
		    address: supplierInfo.address,
		    contact_number: supplierInfo.number,
		    items:items
		});

		const buf = doc.getZip().generate({ type: "nodebuffer" });

		fs.writeFileSync(path.resolve("documents", fileName+".docx"), buf);

		res.sendStatus(200)


		//saving in pdf
		/*const doc = new jsPDF('p', 'pt');
		doc.text("Vendor", 50, 70)

		doc.text(`${supplierInfo.name}`, 50, 90)
		doc.text(`${supplierInfo.contactPerson}`, 50, 110)
		doc.text(`${supplierInfo.address}`, 50, 130)
		doc.text(`${supplierInfo.number}`, 50, 150)

		

		var columns = [{title:'Item Description'}, {title:'Quantity'}, {title:'Unit'}]
		var items = []
		for (var i=0; i<temp_items.length; i++) {
			var item = []
			item.push(temp_items[i].itemDesc)
			item.push(temp_items[i].quantity)
			item.push(temp_items[i].unit)
			items.push(item)
		}
		doc.autoTable(columns, items, {
			theme:"grid",
			startY:170
		})

		doc.save(path.resolve("documents", fileName+".pdf")); // will save the file in the current working directory*/

		//var input = path.resolve("documents", fileName+".docx")
		//var output = path.resolve("documents", fileName+".pdf")


		
		/*const task = ilovepdf.newTask('officepdf')

		task.start()
		.then(() => {
		    const file = new ILovePDFFile(input);
		    return task.addFile(file);
		})
		.then(() => {
		    return task.process();
		})
		.then(() => {
		    return task.download();
		})
		.then((data) => {
		    fs.writeFileSync(output, data);
		});*/

	}

}

module.exports = purchaseOrderController;