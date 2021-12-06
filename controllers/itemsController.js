// import module `database` from `../models/db.js`
const db = require('../models/db.js');

const Items = require('../models/ItemsModel.js');

const ItemCategories = require('../models/ItemCategoriesModel.js');

require('../controllers/helpers.js');

const itemsController = {

	getItemList: function(req, res) {

		async function getInformation() {
			var items_temp = await getItems();
			var items = [];
			for (var i=0; i<items_temp.length; i++) {
				var categoryName = await getCategoryName(items_temp[i].categoryID);
				var item = {
                    itemID: items_temp[i]._id,
					itemCode: items_temp[i].itemCode,
                    itemDescription:items_temp[i].itemDescription,
                    category: categoryName,
                    unitID:items_temp[i].unitID,
					reorderLevel:items_temp[i].reorderLevel
				};
				items.push(item);
			}

			var categories = await getAllCategories();

			res.render('supplierInformation', {categories, items});
		}

		getInformation();

	},

	postItemInformation: function(req, res) {
		var item = {
			itemCode: req.body.itemCode,
			itemDesciption:req.body.itemDesciption,
            categoryID: req.body.categoryID,
			unitID: req.body.unitID,
			EOQ: req.body.EOQ,
            reorderLevel: req.body.reorderLevel,
			informationStatusID: "618a7830c8067bf46fbfd4e4"
		};

		db.insertOne(Items, item, function (flag) {
			if (flag) { }
		});

	},

	checkItemCode: function(req, res) {
		var item = req.query.item;

		db.findMany(Items, {item:item, informationStatusID:"618a7830c8067bf46fbfd4e4"}, 'item', function(result) {	
			res.send(result[0]);
		});

	},


	postUpdateInformation: function(req, res) {
		var itemID = req.body.itemID;

		db.updateOne(Items, {_id:itemID}, {$set: {informationStatusID:"618a783cc8067bf46fbfd4e5"}}, function(flag) {
			if (flag) { }
		});

		var item = {
            itemCode: req.body.itemCode,
			itemDesciption:req.body.itemDesciption,
            categoryID: req.body.categoryID,
			unitID: req.body.unitID,
			EOQ: req.body.EOQ,
            reorderLevel: req.body.reorderLevel,
			informationStatusID: "618a7830c8067bf46fbfd4e4"
		}

		db.insertOneResult(Items, item, function(result) {
			res.send(result._id)
		})
	},

	deleteItems: function(req, res) {
		var itemID = req.body.itemID;
		db.updateOne(Items, {_id: itemID}, {$set: {informationStatusID:"618a783cc8067bf46fbfd4e5"}}, function(flag){
			if (flag) { }
		});
	}
};

module.exports = itemsController;