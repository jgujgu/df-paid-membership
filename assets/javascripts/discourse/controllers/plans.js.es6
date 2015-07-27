export default Ember.ArrayController.extend({
	_init: function() {
		this.set('filterMode', 'plans');
	}.on('init')
	,navItems: function() {
		return Discourse.NavItem.buildList(null, {filterMode: this.get('filterMode')});
	}.property('filterMode')
});
